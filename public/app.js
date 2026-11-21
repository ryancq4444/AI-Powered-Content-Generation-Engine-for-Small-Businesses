// AI-Powered Content Generation Engine - website (React)
const { useState, useEffect, useRef } = React;

// Calls the server. Throws an error with .errors (field messages) if the request fails.
async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || 'Please fix the highlighted fields'), { errors: data.errors || {} });
  return data;
}
const go = (page) => (location.hash = page);
const TYPES = ['Blog Post Outline', 'Instagram Caption', 'Facebook Caption', 'Email Newsletter', 'Advertisement', 'Product Description', 'Slogan'];
const INDUSTRIES = ['Retail', 'Hospitality', 'Fitness', 'E-commerce', 'Beauty Services', 'Professional Consulting', 'Other'];
const TONES = ['Friendly', 'Professional', 'Playful', 'Calm', 'Bold', 'Inspirational', 'Informative'];

// A form field with help text, an example, a character counter and an error message,
// so users know what to type in each box
function Field({ label, help, error, max, value, set, rows, options, ...props }) {
  return (
    <div className="field">
      <label>{label} {max && <span className="counter">{(value || '').length} / {max}</span>}</label>
      {help && <p className="help">{help}</p>}
      {options ? <select value={value} onChange={(e) => set(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o || 'Choose...'}</option>)}</select>
        : React.createElement(rows ? 'textarea' : 'input', { value, rows, maxLength: max, onChange: (e) => set(e.target.value), ...props })}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Lets each form keep its values in one object: field('name') gives value + setter
function useForm(start) {
  const [form, setForm] = useState(start);
  return [form, setForm, (name) => ({ value: form[name], set: (v) => setForm((f) => ({ ...f, [name]: v })) })];
}

// Home, Register and Login pages
function Home() {
  return (
    <div className="center-page">
      <h1>Marketing content for your small business, in minutes</h1>
      <p className="help">1. Describe your business &nbsp; 2. Choose what to create &nbsp; 3. Edit, check SEO and save</p>
      <button onClick={() => go('register')}>Register</button> <button className="outline" onClick={() => go('login')}>Login</button>
    </div>
  );
}

function Register({ onLogin }) {
  const [form, , field] = useForm({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const p = form.password;
  const rules = [['8+ characters', p.length >= 8], ['an uppercase letter', /[A-Z]/.test(p)], ['a number', /\d/.test(p)], ['a special character', /[^A-Za-z0-9]/.test(p)]];
  const ready = form.fullName && /^\S+@\S+\.\S+$/.test(form.email) && rules.every((r) => r[1]) && p === form.confirmPassword;
  const submit = () => api('/register', form).then(onLogin).catch((e) => setErrors(e.errors));
  return (
    <div className="center-page">
      <h1>Register Your Account</h1>
      <Field label="Full Name" placeholder="e.g. Alex Smith" error={errors.fullName} {...field('fullName')} />
      <Field label="Account email" help="You will use this to log in." placeholder="e.g. alex@mybusiness.com.au" error={errors.email} {...field('email')} />
      <Field label="Password" type="password" error={errors.password} {...field('password')} />
      <p className="help">Password needs: {rules.map(([text, ok]) => <span key={text} className={ok ? 'ok' : 'error'}>{ok ? '✓' : '✗'} {text} </span>)}</p>
      <Field label="Confirm Password" type="password" error={errors.confirmPassword || (form.confirmPassword && p !== form.confirmPassword && 'Passwords do not match')} {...field('confirmPassword')} />
      <button disabled={!ready} onClick={submit}>Register</button>
      <p>Already have an account? <a href="#login">Login</a></p>
    </div>
  );
}

function Login({ onLogin }) {
  const [form, , field] = useForm({ email: '', password: '' });
  const [error, setError] = useState('');
  const submit = () => api('/login', form).then(onLogin).catch((e) => setError(e.message));
  return (
    <div className="center-page">
      <h1>Log In</h1>
      {error && <p className="alert">{error}</p>}
      <Field label="Email" {...field('email')} />
      <Field label="Password" type="password" {...field('password')} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      <p><a href="#forgot">Forgot password?</a></p>
      <button onClick={submit}>Log In</button>
      <p>New here? <a href="#register">Create an account</a></p>
    </div>
  );
}

// Dashboard: counts and quick links
function Dashboard({ user }) {
  const [d, setD] = useState(null);
  useEffect(() => { api('/dashboard').then(setD); }, []);
  if (!d) return null;
  return (
    <>
      <h1>Welcome, {user.full_name}!</h1>
      {d.profiles === 0 && <p className="tip">Start here: <a href="#profile">create your business profile</a> so the AI knows about your business.</p>}
      <div className="cards">
        <div className="card"><h3>Generate Content</h3><p>Create new AI posts</p><button onClick={() => go('generate')}>Create New</button></div>
        <div className="card"><h3>Saved Content</h3><p>{d.saved} saved</p><button className="outline" onClick={() => go('saved')}>View All</button></div>
        <div className="card"><h3>Business Profiles</h3><p>{d.profiles} active profiles</p><button className="outline" onClick={() => go('profiles')}>Manage</button></div>
      </div>
    </>
  );
}

// Business profiles: list, create and edit
let editingProfile = null; // the profile being edited (null = new profile)

function Profiles() {
  const [list, setList] = useState([]);
  const load = () => api('/profiles').then(setList);
  useEffect(() => { load(); }, []);
  const remove = (p) => confirm(`Delete ${p.business_name} and its content?`) && api(`/profiles/${p.business_id}`, null, 'DELETE').then(load);
  return (
    <>
      <h1>Business Profiles</h1>
      <button onClick={() => { editingProfile = null; go('profile'); }}>+ Create New Profile</button>
      {list.map((p) => (
        <div className="card" key={p.business_id}>
          <b>{p.business_name}</b> ({p.industry}) - keywords: {p.seo_keywords.join(', ')}
          <div><a href="#profile" onClick={() => (editingProfile = p)}>Edit</a> · <a href="#profiles" onClick={() => remove(p)}>Delete</a></div>
        </div>
      ))}
    </>
  );
}

const EXAMPLE = { businessName: 'Bean & Leaf Cafe', industry: 'Hospitality', products: 'Organic coffee, seasonal soups and vegan cakes baked daily',
  services: 'Office catering', brandVoice: 'Friendly and informative', targetAudience: 'Office workers aged 25-45 nearby who want a quick, healthy lunch',
  seoKeywords: 'organic coffee, healthy lunch, vegan cakes' };

function ProfileForm() {
  const p = editingProfile;
  const [form, setForm, field] = useForm(p ? { businessId: p.business_id, businessName: p.business_name, industry: p.industry, products: p.products,
    services: p.services, brandVoice: p.brand_voice, targetAudience: p.target_audience, seoKeywords: p.seo_keywords.join(', ') }
    : { businessName: '', industry: '', products: '', services: '', brandVoice: '', targetAudience: '', seoKeywords: '' });
  const [errors, setErrors] = useState({});
  const save = () => api('/profiles', form).then(() => go('profiles')).catch((e) => setErrors(e.errors));
  return (
    <div className="with-tips">
      <div>
        <h1>Business Profile</h1>
        <p className="help">The AI uses these answers every time it writes for you. The more specific you are, the more it sounds like you.</p>
        <Field label="Business Name *" help="The name customers know you by." placeholder="e.g. Bean & Leaf Cafe" max={100} error={errors.businessName} {...field('businessName')} />
        <Field label="Industry *" help="Pick the closest match." options={['', ...INDUSTRIES]} error={errors.industry} {...field('industry')} />
        <Field label="Products *" help="Your main products and what makes them special." placeholder="e.g. Organic coffee, seasonal soups, vegan cakes" rows={3} max={1000} error={errors.products} {...field('products')} />
        <Field label="Services (optional)" help="Anything you do rather than sell, e.g. catering, delivery." placeholder="e.g. Office catering" {...field('services')} />
        <Field label="Brand voice (optional)" help='How should your content sound? e.g. Friendly, Professional, Playful. Empty = "Professional".' placeholder="e.g. Friendly and informative" {...field('brandVoice')} />
        <Field label="Target Audience *" help="Who buys from you? How old are they? Where are they? What do they care about?" placeholder="e.g. Office workers aged 25-45 nearby who want a quick, healthy lunch" rows={3} max={500} error={errors.targetAudience} {...field('targetAudience')} />
        <Field label="SEO Keywords *" help="1-10 words people would type into Google to find you. Separate with commas." placeholder="e.g. organic coffee, healthy lunch" error={errors.seoKeywords} {...field('seoKeywords')} />
        <button onClick={save}>Save Profile</button> <button className="outline" onClick={() => go('profiles')}>Cancel</button>
      </div>
      <aside className="tip">
        <h3>Need help? See an example</h3>
        <p>A finished profile for a small cafe. Industry: Hospitality. Target audience: {EXAMPLE.targetAudience}. Keywords: {EXAMPLE.seoKeywords}.</p>
        <button className="outline" onClick={() => setForm({ ...form, ...EXAMPLE })}>Fill form with this example</button>
        <h3>What is an SEO keyword?</h3>
        <p>SEO (search engine optimisation) helps your content show up on Google. Your keywords go into the AI prompt, and the SEO Analysis checks your content uses them.</p>
      </aside>
    </div>
  );
}

// Generate content inside a content chat
function Generate() {
  const [profiles, setProfiles] = useState(null);
  const [chats, setChats] = useState([]);
  const [chat, setChat] = useState(null);
  const [form, , field] = useForm({ contentType: '', topic: '', tone: '', keywords: '', additionalInfo: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/profiles').then(setProfiles); api('/chats').then(setChats); }, []);

  // New chat (no chatId) or switch the profile used by the open chat
  const pickProfile = (businessId, chatId) => api('/chats', { businessId, chatId }).then((c) => { setChat(c); api('/chats').then(setChats); });
  const generate = () => {
    setBusy(true); setError('');
    api('/generate', { ...form, chatId: chat.chat_id }).then((c) => go('editor/' + c.content_id)).catch((e) => { setError(e.message); setBusy(false); });
  };

  if (!profiles) return null;
  if (!profiles.length) return <p className="tip">First <a href="#profile">create a business profile</a> so the AI can write for you.</p>;
  return (
    <div className="with-chats">
      <aside>
        <h3>Content Chats</h3>
        <p className="help">Each chat keeps the content you generate for one business.</p>
        <button onClick={() => pickProfile(profiles[0].business_id)}>+ New Chat</button>
        {chats.map((c) => <div key={c.chat_id} className={'card ' + (chat?.chat_id === c.chat_id ? 'active' : '')} onClick={() => setChat(c)}>{c.business_name}<br /><small>{new Date(c.updated_at).toLocaleString()}</small></div>)}
      </aside>
      <div>
        <h1>Content Generator</h1>
        {!chat ? <p className="help">Click <b>+ New Chat</b> or open a chat to start.</p> : <>
          <p className="help">Your business profile is added to the AI prompt for you - no prompt writing needed.</p>
          {error && <p className="alert">{error}</p>}
          <label>Business profile</label>
          <p className="help">The business this chat writes for. You can switch it at any time.</p>
          <select value={chat.business_id} onChange={(e) => pickProfile(e.target.value, chat.chat_id)}>
            {profiles.map((p) => <option key={p.business_id} value={p.business_id}>{p.business_name}</option>)}
          </select>
          <Field label="Content Type *" help="What should the AI write?" options={['', ...TYPES]} {...field('contentType')} />
          <Field label="Topic *" help="What is it about? One sentence is enough." placeholder="e.g. Launching our new winter soup menu" max={200} {...field('topic')} />
          <Field label="Tone (optional)" help="Leave empty to use your brand voice." options={['', ...TONES]} {...field('tone')} />
          <Field label="Keywords (optional)" help="Leave empty to use your profile's SEO keywords. Separate with commas." placeholder="e.g. healthy lunch" {...field('keywords')} />
          <Field label="Additional information (optional)" help="Details the AI can't guess: offers, dates, prices." placeholder="e.g. $12 lunch deal from 1 June" rows={2} max={500} {...field('additionalInfo')} />
          <button disabled={busy} onClick={generate}>{busy ? 'Generating content...' : 'Generate Content'}</button>
        </>}
      </div>
    </div>
  );
}

// Content editor: review, edit, save, regenerate, discard, delete
let draftForAnalysis = null; // editor text passed to the SEO page (so unsaved edits can be analysed)

function Editor({ id }) {
  const [item, setItem] = useState(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const box = useRef();
  const load = () => api('/content').then((all) => { const c = all.find((x) => x.content_id === id); setItem(c); setTitle(c.content_title); });
  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (item) box.current.innerHTML = item.edited_content || item.ai_output; }, [item]);

  const save = () => api(`/content/${id}`, { title, content: box.current.innerHTML }, 'PUT').then((r) => { setMessage(r.message); load(); }).catch((e) => setMessage(e.message));
  const regenerate = () => api('/generate', { chatId: item.chat_id, contentType: item.content_type, topic: item.topic, tone: item.tone,
    keywords: item.keywords.join(','), additionalInfo: item.additional_info }).then((c) => go('editor/' + c.content_id)).catch((e) => setMessage(e.message));
  const discard = () => { box.current.innerHTML = item.edited_content || item.ai_output; setTitle(item.content_title); setMessage('Changes discarded'); };
  const remove = () => confirm('Delete this content?') && api(`/content/${id}`, null, 'DELETE').then(() => go('saved'));
  const analyse = () => { draftForAnalysis = { title, content: box.current.innerHTML }; go('seo/' + id); };
  const format = (command, value) => document.execCommand(command, false, value);

  if (!item) return null;
  return (
    <>
      <h1>Content Editor</h1>
      <p className="help">{item.content_type} · {item.business_name} · {item.status === 'saved' ? 'Saved' : 'Draft (saved automatically)'}</p>
      {message && <p className="alert">{message}</p>}
      <Field label="Title" value={title} set={setTitle} />
      <label>Content</label>
      <div className="toolbar">
        <button onClick={() => format('bold')}>B</button><button onClick={() => format('italic')}>I</button>
        <button onClick={() => format('formatBlock', 'h2')}>Heading</button><button onClick={() => format('insertUnorderedList')}>• List</button>
      </div>
      <div className="editor" ref={box} contentEditable />
      <button onClick={save}>Save</button> <button className="outline" onClick={analyse}>Analyse SEO & Tone</button>{' '}
      <button className="outline" onClick={regenerate}>Regenerate</button> <button className="outline" onClick={discard}>Discard changes</button>{' '}
      <button className="danger" onClick={remove}>Delete</button>
      <p className="help">Regenerate writes a new draft from the same inputs. Discard goes back to the last saved version.</p>
    </>
  );
}

// Saved content list (also used by the SEO Analysis menu item)
function Saved({ forSeo }) {
  const [items, setItems] = useState([]);
  useEffect(() => { api('/content').then(setItems); }, []);
  return (
    <>
      <h1>{forSeo ? 'SEO Analysis' : 'Saved Content'}</h1>
      <p className="help">{forSeo ? 'Choose content to check for SEO and tone.' : 'Drafts are kept automatically after each generation.'}</p>
      {!items.length && <p className="tip">Nothing yet. <a href="#generate">Generate your first piece</a></p>}
      <table><tbody>
        {items.map((c) => <tr key={c.content_id}><td>{c.content_title}</td><td>{c.content_type}</td><td>{c.business_name}</td><td>{c.status}</td>
          <td><a href={'#editor/' + c.content_id}>Open</a> · <a href={'#seo/' + c.content_id} onClick={() => (draftForAnalysis = null)}>Analyse</a></td></tr>)}
      </tbody></table>
    </>
  );
}

// SEO and tone analysis results page
function Seo({ id }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/analyse/${id}`, draftForAnalysis || {}).then(setR).catch((e) => setError(e.message)); }, [id]);
  if (error) return <p className="alert">{error}</p>;
  if (!r) return <p>Running SEO analysis...</p>;
  return (
    <>
      <h1>SEO & Tone Analysis</h1>
      <div className="cards">
        <div className="card">
          <h2>SEO Score: {r.score} / 100</h2>
          <p className="help">How well the content uses your keywords and how easy it is to read. 70+ is good.
            (Keywords used 60 points + keyword density 20 + readability 20)</p>
          <h3>Keywords</h3>
          {r.keywords.map((k) => <p key={k.keyword} className={k.count ? 'ok' : 'error'}>{k.count ? '✓' : '✗'} {k.keyword}: {k.count ? `${k.count} times (${k.density}%)` : 'not used'}</p>)}
        </div>
        <div className="card">
          <p><b>Tone:</b> {r.tone} <span className="help">(your brand voice: {r.brandVoice})</span></p>
          <p><b>Readability:</b> {r.readability} <span className="help">(Flesch score {r.flesch}: 60+ Good, 50-59 Fair, under 50 Poor)</span></p>
          <b>Suggestions</b>
          <ul>{r.suggestions.map((s) => <li key={s}>{s}</li>)}</ul>
          {r.tone === 'Unavailable' && <p className="help">Tone check unavailable - try again later.</p>}
        </div>
      </div>
      <button onClick={() => go('editor/' + id)}>Back to Editor</button>
      <p className="help">Your content has not been changed - you decide which suggestions to use.</p>
    </>
  );
}

// Layout, menu and page switching
function App() {
  const [user, setUser] = useState(undefined);
  const [page, setPage] = useState(location.hash.slice(1));
  const checkLogin = () => api('/me').then(setUser).catch(() => setUser(null));
  const afterLogin = () => checkLogin().then(() => go('dashboard'));
  useEffect(() => { checkLogin(); onhashchange = () => setPage(location.hash.slice(1)); }, []);
  if (user === undefined) return null;

  const [name, id] = page.split('/');
  const publicPages = { register: <Register onLogin={afterLogin} />, login: <Login onLogin={afterLogin} />,
    forgot: <p className="center-page">Password reset by email is not available yet. Please contact the administrator.</p> };
  if (!user) return <><header>AI Content Generator</header>{publicPages[name] || <Home />}</>;

  const pages = { profiles: <Profiles />, profile: <ProfileForm />, generate: <Generate />, editor: <Editor id={id} />,
    saved: <Saved />, seoList: <Saved forSeo />, seo: <Seo id={id} /> };
  const logout = (e) => { e.preventDefault(); api('/logout', {}).then(() => { setUser(null); go('login'); }); };
  const nav = [['dashboard', 'Dashboard'], ['profiles', 'Business Profile'], ['generate', 'Generate Content'], ['saved', 'Saved Content'], ['seoList', 'SEO Analysis']];
  return (
    <>
      <header>AI Content Generator <span>{user.full_name}</span></header>
      <div className="layout">
        <nav>{nav.map(([p, label]) => <a key={p} href={'#' + p} className={name === p ? 'active' : ''}>{label}</a>)}<a href="#" onClick={logout}>Logout</a></nav>
        <main>{pages[name] || <Dashboard user={user} />}</main>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
