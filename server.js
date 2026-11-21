// AI-Powered Content Generation Engine - server (Node.js + Express + PostgreSQL + Gemini API)
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import fs from 'node:fs';

const app = express();
app.use(express.json(), cookieParser(), express.static('public'));
['react/umd', 'react-dom/umd', '@babel/standalone'].forEach((lib) => app.use('/lib', express.static(`node_modules/${lib}`)));

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const query = async (sql, params) => (await db.query(sql, params)).rows;   // $1, $2 parameters keep user input separate from the SQL (stops SQL injection)
const one = async (sql, params) => (await query(sql, params))[0];
const clean = (v) => String(v ?? '').replace(/<[^>]*>/g, '').trim();       // removes HTML tags from user input
const keywordList = (v) => [...new Set(String(v ?? '').split(',').map((k) => clean(k).toLowerCase()).filter(Boolean))];
const safeHtml = (html) => String(html ?? '').replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<(?!\/?(p|h1|h2|b|strong|i|em|ul|ol|li|br)\b)[^>]*>/gi, '').replace(/<(\w+)\s[^>]*>/g, '<$1>'); // keeps only formatting tags, removes scripts

// Saves errors and failed AI requests in the error_logs table with a timestamp
const logError = (userId, endpoint, message) =>
  query('INSERT INTO error_logs (user_id, endpoint, error_message) VALUES ($1, $2, $3)', [userId, endpoint, message]).catch(() => {});

// Login token: the user ID is read from a signed token (JWT), never from the request.
// Every query then uses "AND user_id = req.userId", so users can only reach their own data.
function auth(req, res, next) {
  try {
    req.userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).userId;
    next();
  } catch {
    res.status(401).json({ error: 'Please log in' });
  }
}
const login = (res, userId) => res.cookie('token', jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '1h' }), { httpOnly: true });

// Register a new account
app.post('/api/register', async (req, res) => {
  const { fullName, email, password = '', confirmPassword } = req.body;
  const errors = {};
  if (!clean(fullName)) errors.fullName = 'Full name is required';
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Email address is invalid';
  if (!(password.length >= 8 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)))
    errors.password = 'Password needs 8+ characters, an uppercase letter, a number and a special character';
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';
  if (await one('SELECT 1 FROM users WHERE email = $1', [email?.toLowerCase()])) errors.email = 'Email already registered - please log in';
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const hash = await bcrypt.hash(password, 12); // hash the password with bcrypt
  const user = await one('INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id',
    [clean(fullName), email.toLowerCase(), hash]);
  login(res, user.user_id);
  res.json({ message: 'Account created successfully' });
});

// Log in (5 failed attempts locks the account for 15 minutes)
app.post('/api/login', async (req, res) => {
  const user = await one('SELECT * FROM users WHERE email = $1', [String(req.body.email).toLowerCase()]);
  if (user?.locked_until > new Date()) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  if (!user || !(await bcrypt.compare(String(req.body.password), user.password_hash))) {
    if (user) await query(`UPDATE users SET failed_logins = (failed_logins + 1) % 5,
      locked_until = CASE WHEN failed_logins >= 4 THEN now() + interval '15 minutes' END WHERE user_id = $1`, [user.user_id]);
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  await query('UPDATE users SET failed_logins = 0 WHERE user_id = $1', [user.user_id]);
  login(res, user.user_id);
  res.json({ message: 'Login successful' });
});

app.post('/api/logout', (req, res) => res.clearCookie('token').json({ message: 'Logged out successfully' }));
app.get('/api/me', auth, async (req, res) => res.json(await one('SELECT full_name FROM users WHERE user_id = $1', [req.userId])));

app.get('/api/dashboard', auth, async (req, res) => res.json(await one(`SELECT
  (SELECT COUNT(*) FROM business_profiles WHERE user_id = $1)::int AS profiles,
  (SELECT COUNT(*) FROM generated_content WHERE user_id = $1 AND status = 'saved')::int AS saved`, [req.userId])));

// Business profiles: list, create or update, delete
app.get('/api/profiles', auth, async (req, res) =>
  res.json(await query('SELECT * FROM business_profiles WHERE user_id = $1 ORDER BY business_name', [req.userId])));

app.post('/api/profiles', auth, async (req, res) => {          // create (no id) or update (with id)
  const b = req.body;
  const keywords = keywordList(b.seoKeywords);
  const errors = {};
  if (!clean(b.businessName)) errors.businessName = 'Business name is required';
  if (!clean(b.industry)) errors.industry = 'Industry is required';
  if (!clean(b.products)) errors.products = 'Products are required';
  if (clean(b.targetAudience).length < 10) errors.targetAudience = 'Target audience is required (at least 10 characters)';
  if (keywords.length < 1 || keywords.length > 10) errors.seoKeywords = 'Enter 1 to 10 keywords';
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const values = [clean(b.businessName), clean(b.industry), clean(b.products), clean(b.services), clean(b.brandVoice),
    clean(b.targetAudience), keywords, req.userId];
  const saved = b.businessId
    ? await one(`UPDATE business_profiles SET business_name = $1, industry = $2, products = $3, services = $4, brand_voice = $5,
        target_audience = $6, seo_keywords = $7 WHERE user_id = $8 AND business_id = $9 RETURNING *`, [...values, b.businessId])
    : await one(`INSERT INTO business_profiles (business_name, industry, products, services, brand_voice, target_audience,
        seo_keywords, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, values);
  if (!saved) return res.status(404).json({ error: 'Business profile not found' });
  res.json({ message: 'Business profile saved' });
});

app.delete('/api/profiles/:id', auth, async (req, res) => {
  await query('DELETE FROM business_profiles WHERE business_id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ message: 'Business profile deleted' });
});

// Content chats: a saved "Generate Content" session linked to one business profile
app.get('/api/chats', auth, async (req, res) => res.json(await query(`SELECT c.*, b.business_name FROM content_chats c
  JOIN business_profiles b USING (business_id) WHERE c.user_id = $1 ORDER BY c.updated_at DESC`, [req.userId])));

app.post('/api/chats', auth, async (req, res) => {             // new chat, or switch the profile of an existing chat
  const profile = await one('SELECT * FROM business_profiles WHERE business_id = $1 AND user_id = $2', [req.body.businessId, req.userId]);
  if (!profile) return res.status(400).json({ error: 'Choose one of your business profiles' });
  const chat = req.body.chatId
    ? await one('UPDATE content_chats SET business_id = $1 WHERE chat_id = $2 AND user_id = $3 RETURNING *', [profile.business_id, req.body.chatId, req.userId])
    : await one('INSERT INTO content_chats (user_id, business_id) VALUES ($1, $2) RETURNING *', [req.userId, profile.business_id]);
  res.json(chat);
});

// Sends a prompt to the AI (Gemini) and returns its JSON reply
async function askGpt(system, user) {
  for (let attempt = 1; ; attempt++) {                         // try again once if it fails
    try {
      const response = await fetch(`${process.env.AI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(10000),                     // stop waiting after 10 seconds
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message);
      return JSON.parse(data.choices[0].message.content.replace(/```(json)?/g, '')); // removes ``` marks if the AI adds them
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

app.post('/api/generate', auth, async (req, res) => {
  const { chatId, contentType, topic, tone, keywords, additionalInfo } = req.body;
  if (!contentType || clean(topic).length < 5) return res.status(400).json({ error: 'Choose a content type and enter a topic (at least 5 characters)' });
  const p = await one(`SELECT b.* FROM content_chats c JOIN business_profiles b USING (business_id)
    WHERE c.chat_id = $1 AND c.user_id = $2`, [chatId, req.userId]);
  if (!p) return res.status(404).json({ error: 'Chat not found' });
  const words = keywordList(keywords).length ? keywordList(keywords) : p.seo_keywords;

  // Prompt engineering: the business profile is added to every prompt, so users never write prompts themselves
  const system = 'You are a marketing copywriter for small businesses. Only use the facts given; never invent prices or claims. '
    + 'Use the SEO keywords naturally. Reply only with JSON: {"title": "...", "body": "..."}. Write the body as simple HTML '
    + 'using only <h2>, <p>, <ul> and <li>. For social media posts, end the body with relevant hashtags.';
  const prompt = `Business: ${p.business_name} (${p.industry})\nProducts: ${p.products}\nServices: ${p.services || 'none'}\n`
    + `Target audience: ${p.target_audience}\nBrand voice / tone: ${clean(tone) || p.brand_voice || 'Professional'}\n`
    + `SEO keywords: ${words.join(', ')}\nWrite a ${contentType} about: ${clean(topic)}\nExtra information: ${clean(additionalInfo) || 'none'}`;

  let ai;
  try {
    ai = await askGpt(system, prompt);
  } catch (err) {
    logError(req.userId, 'generate', err.message);
    return res.status(503).json({ error: 'Content generation failed - please try again' });
  }
  // The draft is saved automatically straight after generation
  const content = await one(`INSERT INTO generated_content (chat_id, user_id, business_id, content_type, topic, tone, keywords,
    additional_info, prompt_text, ai_output, content_title) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
  [chatId, req.userId, p.business_id, contentType, clean(topic), clean(tone), words, clean(additionalInfo), prompt, safeHtml(ai.body), clean(ai.title)]);
  await query('UPDATE content_chats SET updated_at = now() WHERE chat_id = $1', [chatId]);
  res.json(content);
});

// Saved content: view, save (after generating or editing), delete
app.get('/api/content', auth, async (req, res) => res.json(await query(`SELECT g.*, b.business_name FROM generated_content g
  JOIN business_profiles b USING (business_id) WHERE g.user_id = $1 ORDER BY g.updated_at DESC`, [req.userId])));

// Ownership check: "AND user_id = $4" only matches content owned by the logged-in user.
// Another user's content matches no row, so nothing changes and "access denied" is shown.
app.put('/api/content/:id', auth, async (req, res) => {
  const saved = await one(`UPDATE generated_content SET edited_content = $1, content_title = $2, status = 'saved', updated_at = now()
    WHERE content_id = $3 AND user_id = $4 RETURNING *`, [safeHtml(req.body.content), clean(req.body.title), req.params.id, req.userId]);
  if (!saved) return res.status(404).json({ error: 'Content not found or access denied' });
  res.json({ message: 'Content saved successfully' });
});

app.delete('/api/content/:id', auth, async (req, res) => {
  await query('DELETE FROM generated_content WHERE content_id = $1 AND user_id = $2', [req.params.id, req.userId]);
  res.json({ message: 'Content deleted successfully' });
});

// SEO and tone analysis
// SEO score out of 100, calculated by this code (not by the AI):
//   keywords used 60 + keyword density 20 (each keyword is 0.5-5% of words) + readability 20 (Flesch Reading Ease)
// The AI is only asked for the tone and improvement suggestions.
app.post('/api/analyse/:id', auth, async (req, res) => {
  const c = await one(`SELECT g.*, b.brand_voice FROM generated_content g JOIN business_profiles b USING (business_id)
    WHERE g.content_id = $1 AND g.user_id = $2`, [req.params.id, req.userId]);
  if (!c) return res.status(404).json({ error: 'Content not found or access denied' });

  const text = `${c.content_title}. ` + safeHtml(req.body.content || c.edited_content || c.ai_output).replace(/<\/(p|h\d|li)>/g, '.\n').replace(/<[^>]+>/g, ' ');
  const words = text.toLowerCase().match(/[a-z0-9']+/g) || [];
  const keywords = c.keywords.map((keyword) => {
    const k = keyword.replace(/[^a-z0-9 ]/g, '');             // counts "healthy lunch" and #healthylunch
    const count = (text.toLowerCase().match(new RegExp(`\\b${k}|#${k.replace(/ /g, '')}`, 'g')) || []).length;
    return { keyword, count, density: Math.round((count / words.length) * 1000) / 10 };
  });
  const used = keywords.filter((k) => k.count > 0);
  const goodDensity = used.filter((k) => k.density >= 0.5 && k.density <= 5);

  // Flesch Reading Ease = 206.835 - 1.015 x (words / sentences) - 84.6 x (syllables / words)
  const sentences = text.split(/[.!?\n]+/).filter((s) => /[a-z]/i.test(s)).length;
  const syllables = words.reduce((sum, w) => sum + Math.max(1, (w.replace(/e$/, '').match(/[aeiouy]+/g) || []).length), 0);
  const flesch = Math.round(206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / words.length));
  const readability = flesch >= 60 ? 'Good' : flesch >= 50 ? 'Fair' : 'Poor';
  const score = Math.round(60 * used.length / keywords.length + (used.length ? 20 * goodDensity.length / used.length : 0)
    + (flesch >= 60 ? 20 : flesch >= 50 ? 10 : 0));

  let tone = 'Unavailable', suggestions = [];
  try {
    ({ tone, suggestions } = await askGpt('You review marketing text. Reply only with JSON: {"tone": "one word", "suggestions": ["3 to 5 short tips"]}',
      `Brand voice: ${c.tone || c.brand_voice || 'Professional'}\nKeywords not used: ${keywords.filter((k) => !k.count).map((k) => k.keyword).join(', ') || 'none'}\n\n${text}`));
  } catch (err) {
    logError(req.userId, 'analyse', err.message);                // SEO results are still shown if the AI is down
  }
  await query(`INSERT INTO analysis_reports (content_id, user_id, seo_score, readability_score, readability_level, tone_result,
    keyword_results, suggestions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [c.content_id, req.userId, score, flesch, readability, tone, JSON.stringify(keywords), JSON.stringify(suggestions)]);
  res.json({ score, flesch, readability, keywords, tone, brandVoice: c.tone || c.brand_voice || 'Professional', suggestions });
});

// Any unexpected error is logged and the user gets a message instead of a crash
app.use((err, req, res, next) => {
  logError(req.userId, req.path, err.message);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

if (process.argv.includes('--init-db')) {                       // "npm run db:init" creates the tables
  await db.query(fs.readFileSync('schema.sql', 'utf8'));
  console.log('Database tables are ready.');
  process.exit();
}
app.listen(4000, () => console.log('Website running at http://localhost:4000'));
