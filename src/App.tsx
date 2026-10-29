import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, Bell, CalendarDays,
  Check, ChevronDown, ClipboardCheck, Coins, FileText,
  LayoutDashboard, Menu, MessageCircle, Package, Plus, Search,
  Settings, ShieldCheck, Sparkles, Users, Wallet, X,
} from 'lucide-react'
import InstallGuideDialog from './InstallGuideDialog'

type View = 'Overview' | 'Members' | 'Attendance' | 'Finance' | 'Calendar' | 'Tasks' | 'Communications' | 'Logistics'
type Member = { initials: string; name: string; role: string; team: string; status: 'Active' | 'On leave'; points: number; color: string }

const initialMembers: Member[] = [
  { initials: 'SA', name: 'Salma Amrani', role: 'Member', team: 'Biotechnology', status: 'Active', points: 128, color: 'rose' },
  { initials: 'YB', name: 'Youssef Bennis', role: 'Vice HR', team: 'Applied Biology', status: 'Active', points: 214, color: 'blue' },
  { initials: 'IM', name: 'Imane Mansouri', role: 'Treasurer', team: 'Biochemistry', status: 'Active', points: 186, color: 'gold' },
  { initials: 'AK', name: 'Amine Kabbaj', role: 'Member', team: 'Ecology', status: 'Active', points: 96, color: 'violet' },
  { initials: 'NE', name: 'Nour El Idrissi', role: 'General Secretary', team: 'Biotechnology', status: 'Active', points: 242, color: 'mint' },
]

const roles = ['President', 'Vice President', 'Communications Officer', 'Treasurer', 'Vice Treasurer', 'HR', 'Vice HR', 'General Secretary', 'Logistics Officer', 'Vice Logistics Officer', 'Member']
const nav: { label: View; icon: typeof LayoutDashboard; group: string }[] = [
  { label: 'Overview', icon: LayoutDashboard, group: 'WORKSPACE' },
  { label: 'Members', icon: Users, group: 'CLUB MANAGEMENT' },
  { label: 'Attendance', icon: ClipboardCheck, group: 'CLUB MANAGEMENT' },
  { label: 'Finance', icon: Wallet, group: 'CLUB MANAGEMENT' },
  { label: 'Calendar', icon: CalendarDays, group: 'CLUB LIFE' },
  { label: 'Tasks', icon: Check, group: 'CLUB LIFE' },
  { label: 'Communications', icon: MessageCircle, group: 'CLUB LIFE' },
  { label: 'Logistics', icon: Package, group: 'CLUB LIFE' },
]

function App() {
  const [view, setView] = useState<View>('Overview')
  const [role, setRole] = useState('President')
  const [members, setMembers] = useState(initialMembers)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [showInstall, setShowInstall] = useState(false)

  const visibleMembers = useMemo(() => members.filter((member) => `${member.name} ${member.role} ${member.team}`.toLowerCase().includes(query.toLowerCase())), [members, query])

  function toast(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  function addDemoMember() {
    const member = { initials: 'NM', name: 'New member', role: 'Member', team: 'To be assigned', status: 'Active' as const, points: 0, color: 'mint' }
    setMembers((current) => [member, ...current])
    toast('Demo member added locally')
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup"><img src="/bac-logo.png" alt="Biologists in Action Club" className="brand-mark brand-logo-image" /><div><strong>BAC<span className="brand-dot">.</span></strong><small>CLUB PLATFORM</small></div><button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="club-switch"><div className="club-avatar club-logo-image"><img src="/bac-logo.png" alt="" /></div><div className="club-name"><strong>Biologists in Action</strong><small>FST Settat · Demo term</small></div><ChevronDown size={15} /></div>
        <nav className="side-nav" aria-label="Main navigation">
          {['WORKSPACE', 'CLUB MANAGEMENT', 'CLUB LIFE'].map((group) => <div className="nav-group" key={group}>
            <div className="nav-caption">{group}</div>
            {nav.filter((item) => item.group === group).map(({ label, icon: Icon }) => <button key={label} onClick={() => { setView(label); setMobileNav(false) }} className={`nav-item ${view === label ? 'selected' : ''}`}><Icon size={17} strokeWidth={1.9} /><span>{label}</span>{label === 'Tasks' && <b className="nav-count">3</b>}</button>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-spark"><Sparkles size={15} /></div><strong>Club, in sync.</strong><p>Bring your people and projects together.</p><button onClick={() => setShowInstall(true)}>Install the app <ArrowUpRight size={13} /></button></div>
          <button className="nav-item"><Settings size={17} /><span>Settings</span></button>
          <div className="profile-mini"><div className="avatar avatar-dark">BA</div><div className="profile-name"><strong>BAC Admin</strong><small>{role}</small></div><button className="icon-button" aria-label="Account menu"><ChevronDown size={15} /></button></div>
        </div>
      </aside>

      {mobileNav && <button className="scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Club</span><span className="crumb-slash">/</span><strong>{view}</strong></div>
          <div className="topbar-actions">
            <label className="role-switch"><ShieldCheck size={15} /><span className="role-label">View as</span><select aria-label="Preview role" value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
            <button className="icon-button search-top" onClick={() => document.getElementById('global-search')?.focus()} aria-label="Search"><Search size={18} /></button>
            <button className="icon-button notification-button" onClick={() => toast('You’re all caught up')} aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="avatar avatar-gold top-avatar">BA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="demo-banner"><span className="demo-pulse" /> Preview workspace <span className="banner-separator">·</span> Sample data only <button onClick={() => toast('Connect Supabase to enable live club data')}>Connect backend <ArrowUpRight size={12} /></button></div>
          {view === 'Overview' && <Overview onNavigate={setView} onToast={toast} />}
          {view === 'Members' && <MembersView members={visibleMembers} query={query} setQuery={setQuery} onAdd={addDemoMember} />}
          {view === 'Attendance' && <AttendanceView onToast={toast} />}
          {view === 'Finance' && <FinanceView onToast={toast} />}
          {view === 'Calendar' && <SimpleView title="Club calendar" subtitle="Meetings, events, and the moments that bring BAC together." icon={<CalendarDays />} action="Create event" onAction={() => toast('Event creation will be connected to Supabase')} />}
          {view === 'Tasks' && <TasksView onToast={toast} />}
          {view === 'Communications' && <SimpleView title="Communications" subtitle="Keep members connected with official updates and club news." icon={<MessageCircle />} action="Write an update" onAction={() => toast('Publishing will be connected to Supabase')} />}
          {view === 'Logistics' && <LogisticsView onToast={toast} />}
        </div>
        <footer className="footer"><span>© {new Date().getFullYear()} Biologists in Action Club</span><span><i className="online-dot" /> Sample data only <span className="footer-divider">·</span> <button onClick={() => setShowInstall(true)}>Install guide</button></span></footer>
      </main>

      {showInstall && <InstallGuideDialog onClose={() => setShowInstall(false)} />}
      {notice && <div className="toast"><Check size={16} />{notice}</div>}
    </div>
  )
}

function PageHeading({ eyebrow, title, subtitle, action, onAction }: { eyebrow: string; title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <button className="button button-primary" onClick={onAction}><Plus size={16} />{action}</button>}</div>
}

function Overview({ onNavigate, onToast }: { onNavigate: (view: View) => void; onToast: (message: string) => void }) {
  return <>
    <div className="welcome-row"><div><div className="eyebrow">{new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Casablanca',weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date()).toUpperCase()} <span className="eyebrow-mark">✳</span></div><h1>Good morning, BAC <span className="wave">✦</span></h1><p className="welcome-subtitle">Here’s what’s happening across your club today.</p></div><button className="button button-outline" onClick={() => onToast('Dashboard export will be available after backend setup')}><FileText size={15} /> Export overview</button></div>
    <section className="hero-panel"><div className="hero-content"><div className="hero-kicker"><span /> YOUR CLUB AT A GLANCE</div><h2>Small actions.<br /><em>Real impact.</em></h2><p>Every gathering, every idea, every helping hand moves BAC forward.</p><div className="hero-actions"><button className="button button-gold" onClick={() => onNavigate('Attendance')}><ClipboardCheck size={15} /> Take attendance</button><button className="hero-link" onClick={() => onNavigate('Calendar')}>Explore calendar <ArrowUpRight size={14} /></button></div></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="hero-core"><span>✳</span></div><span className="art-spark spark-a">✦</span><span className="art-spark spark-b">✳</span><span className="art-spark spark-c">·</span><div className="art-label">BIOLOGISTS<br />IN ACTION</div></div><div className="hero-bottom"><span>SETTAT, MOROCCO</span><span>EST. 2015</span><span>CLUB LHOOB <b>♥</b></span></div></section>
    <div className="section-title-row"><div><h2>Club pulse</h2><p>A little snapshot of your community</p></div><button className="subtle-link" onClick={() => onNavigate('Members')}>View all members <ArrowUpRight size={14} /></button></div>
    <section className="stats-grid">
      <StatCard label="Active members" value="86" delta="+6 this term" icon={<Users />} tone="green" detail="Across 8 study programs" />
      <StatCard label="This month’s attendance" value="78%" delta="+8% vs. last month" icon={<ClipboardCheck />} tone="gold" detail="At 4 club gatherings" />
      <StatCard label="Collected this term" value="3,420" unit="MAD" delta="On track" icon={<Coins />} tone="dark" detail="Of 4,100 MAD expected" />
      <StatCard label="Tasks in progress" value="12" delta="3 due this week" icon={<Check />} tone="pale" detail="Across 5 club teams" />
    </section>
    <section className="lower-grid">
      <div className="surface upcoming-card"><div className="card-heading"><div><div className="eyebrow">NEXT UP</div><h3>Coming together</h3></div><button className="icon-button" onClick={() => onNavigate('Calendar')} aria-label="Open calendar"><ArrowUpRight size={17} /></button></div><div className="event-feature"><div className="event-date"><b>02</b><span>NOV</span></div><div className="event-info"><span className="event-type"><i /> MEMBER GATHERING</span><strong>November club gathering</strong><small><CalendarDays size={13} /> Monday, 4:30 PM <span>·</span> FST Settat</small></div><button className="event-arrow" onClick={() => onNavigate('Calendar')} aria-label="View event"><ArrowUpRight size={16} /></button></div><div className="event-feature event-feature-small"><div className="event-date event-date-light"><b>08</b><span>NOV</span></div><div className="event-info"><span className="event-type event-type-gold"><i /> COMMUNITY OUTREACH</span><strong>Rural health awareness day</strong><small><CalendarDays size={13} /> Sunday, 9:00 AM <span>·</span> Settat Province</small></div><button className="event-arrow" onClick={() => onNavigate('Calendar')} aria-label="View event"><ArrowUpRight size={16} /></button></div><button className="card-bottom-link" onClick={() => onNavigate('Calendar')}>See the full calendar <ArrowUpRight size={13} /></button></div>
      <div className="surface activity-card"><div className="card-heading"><div><div className="eyebrow">THE LATEST</div><h3>Club activity</h3></div><button className="text-button" onClick={() => onNavigate('Communications')}>All updates</button></div><div className="activity-list"><ActivityRow initials="NE" color="mint" title="News published" desc="Caravan collection is now open" when="12 min ago" /> <ActivityRow initials="IM" color="gold" title="Contribution recorded" desc="November gathering · 50 MAD" when="38 min ago" /><ActivityRow initials="YB" color="blue" title="Attendance updated" desc="October gathering · 42 members" when="2 hours ago" /></div><button className="card-bottom-link" onClick={() => onNavigate('Communications')}>View activity history <ArrowUpRight size={13} /></button></div>
    </section>
    <div className="inspiration"><span>“</span><p>Alone we can do so little; together we can do so much.</p><small>THE BAC SPIRIT <i>✳</i></small><div className="inspiration-mark">B<span>.</span></div></div>
  </>
}

function StatCard({ label, value, unit, delta, icon, tone, detail }: { label: string; value: string; unit?: string; delta: string; icon: ReactNode; tone: string; detail: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value}<small>{unit}</small></div><div className="stat-meta"><span>{delta}</span><small>{detail}</small></div></article>
}

function ActivityRow({ initials, color, title, desc, when }: { initials: string; color: string; title: string; desc: string; when: string }) {
  return <div className="activity-row"><div className={`avatar avatar-${color}`}>{initials}</div><div className="activity-copy"><strong>{title}</strong><span>{desc}</span></div><time>{when}</time></div>
}

function MembersView({ members, query, setQuery, onAdd }: { members: Member[]; query: string; setQuery: (value: string) => void; onAdd: () => void }) {
  return <><PageHeading eyebrow="YOUR COMMUNITY" title="Members" subtitle="The people, ideas, and energy behind BAC." action="Add member" onAction={onAdd} /><div className="toolbar"><label className="search-field"><Search size={16} /><input id="global-search" placeholder="Search members, roles, programs…" value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label><button className="button button-outline"><span className="filter-glyph">☷</span> Filters</button><button className="button button-outline">All members <ChevronDown size={14} /></button></div><div className="surface table-card"><div className="table-summary"><span><b>86</b> members</span><span className="table-dot" /> <span>82 active</span><span className="table-summary-right">Sample roster</span></div><div className="table-scroll"><table><thead><tr><th>MEMBER</th><th>ROLE</th><th>STUDY PROGRAM</th><th>STATUS</th><th>POINTS</th><th /></tr></thead><tbody>{members.map((member) => <tr key={member.name}><td><div className="member-cell"><div className={`avatar avatar-${member.color}`}>{member.initials}</div><div><strong>{member.name}</strong><small>Joined Sep 2026</small></div></div></td><td><span className="role-chip">{member.role}</span></td><td>{member.team}</td><td><span className={`status-pill ${member.status === 'Active' ? 'status-active' : 'status-pending'}`}><i />{member.status}</span></td><td><b className="points-value">{member.points}</b> <span className="points-label">pts</span></td><td><button className="row-menu" aria-label={`More about ${member.name}`}>···</button></td></tr>)}</tbody></table></div><div className="table-footer">Showing {members.length} sample members <button>Previous</button><button className="page-current">1</button><button>2</button><button>3</button><button>Next</button></div></div></>
}

function AttendanceView({ onToast }: { onToast: (message: string) => void }) {
  return <><PageHeading eyebrow="SHOWING UP MATTERS" title="Attendance" subtitle="Simple check-ins. A clearer picture of participation." action="Open a session" onAction={() => onToast('Live QR generation requires the Supabase backend')} /><div className="attendance-layout"><section className="surface scan-card"><div className="scan-header"><div><span className="live-badge"><i /> SESSION PREVIEW</span><h3>November gathering</h3><p>Monday, November 2 · FST Settat</p></div><span className="scan-lock"><ShieldCheck size={17} /></span></div><div className="qr-placeholder" aria-label="QR code placeholder"><div className="qr-pattern"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div><div className="qr-center">B<span>.</span></div></div><div className="qr-caption"><strong>QR preview only</strong><span>Signed, rotating attendance codes are enabled after backend setup.</span></div><button className="button button-primary button-wide" onClick={() => onToast('Camera check-in will be available when connected')}><ClipboardCheck size={16} /> Start check-in</button><div className="session-meta"><span><Users size={14} /> 42 checked in</span><span><Coins size={14} /> 50 MAD contribution</span></div></section><section className="surface attendance-roster"><div className="card-heading"><div><div className="eyebrow">RECENT SESSION</div><h3>October gathering</h3></div><button className="text-button" onClick={() => onToast('Full attendance list will load from the backend')}>View list</button></div><div className="attendance-rate"><div><strong>78%</strong><span>attendance rate</span></div><div className="rate-track"><i /></div><small>42 of 54 members checked in</small></div><div className="roster-mini"><ActivityRow initials="SA" color="rose" title="Salma Amrani" desc="Checked in at 4:32 PM" when="Present" /><ActivityRow initials="YB" color="blue" title="Youssef Bennis" desc="Checked in at 4:34 PM" when="Present" /><ActivityRow initials="AK" color="violet" title="Amine Kabbaj" desc="Not checked in yet" when="Pending" /></div><button className="card-bottom-link" onClick={() => onToast('Manual attendance corrections will be audit logged')}>Manage attendance <ArrowUpRight size={13} /></button></section></div></>
}

function FinanceView({ onToast }: { onToast: (message: string) => void }) {
  return <><PageHeading eyebrow="CLEAR RECORDS, SHARED TRUST" title="Club finances" subtitle="Contributions, purchases, and event costs in one place." action="Record a transaction" onAction={() => onToast('Financial entries will be saved after backend setup')} /><section className="stats-grid finance-stats"><StatCard label="Collected this term" value="3,420" unit="MAD" delta="83% of target" icon={<ArrowDownLeft />} tone="green" detail="68 recorded contributions" /><StatCard label="Club purchases" value="1,680" unit="MAD" delta="12 transactions" icon={<ArrowUpRight />} tone="gold" detail="Receipts attached: 10" /><StatCard label="Available balance" value="1,740" unit="MAD" delta="Updated today" icon={<Wallet />} tone="dark" detail="Based on sample entries" /></section><div className="surface finance-table"><div className="card-heading"><div><div className="eyebrow">RECENT ACTIVITY</div><h3>Money in, money out</h3></div><button className="button button-outline" onClick={() => onToast('CSV export will be connected to the live ledger')}><FileText size={14} /> Export CSV</button></div><div className="transaction-row"><span className="transaction-symbol income"><ArrowDownLeft size={16} /></span><div><strong>Member contributions</strong><small>October gathering · 42 members</small></div><time>Oct 19</time><b className="amount-positive">+2,100 MAD</b></div><div className="transaction-row"><span className="transaction-symbol expense"><ArrowUpRight size={16} /></span><div><strong>Event supplies</strong><small>Community outreach · Receipt attached</small></div><time>Oct 17</time><b>−680 MAD</b></div><div className="transaction-row"><span className="transaction-symbol income"><ArrowDownLeft size={16} /></span><div><strong>Event contributions</strong><small>Science workshop · 22 members</small></div><time>Oct 12</time><b className="amount-positive">+1,320 MAD</b></div><div className="finance-note"><ShieldCheck size={15} /><span>Every change will be attributed to its officer. Posted entries are corrected with a reversal, never deleted.</span></div></div></>
}

function TasksView({ onToast }: { onToast: (message: string) => void }) {
  const tasks = [{ title: 'Confirm venue for November gathering', who: 'Logistics team', when: 'Due Oct 31', tag: 'PRIORITY', done: false }, { title: 'Prepare outreach collection announcement', who: 'Communications team', when: 'Due Nov 01', tag: 'COMMUNICATIONS', done: false }, { title: 'Update member attendance records', who: 'HR team', when: 'Due Nov 03', tag: 'HR', done: true }, { title: 'Collect supply purchase receipts', who: 'Treasury team', when: 'Due Nov 04', tag: 'FINANCE', done: false }]
  return <><PageHeading eyebrow="MAKE IT HAPPEN" title="Tasks & projects" subtitle="Clear ownership helps good ideas turn into action." action="Create a task" onAction={() => onToast('Task creation will be connected to Supabase')} /><div className="task-summary"><div className="task-summary-card"><span>OPEN TASKS</span><strong>12</strong></div><div className="task-summary-card"><span>DUE THIS WEEK</span><strong>3</strong></div><div className="task-summary-card"><span>COMPLETED THIS MONTH</span><strong>18</strong></div></div><section className="surface task-list"><div className="card-heading"><div><div className="eyebrow">TEAM BOARD</div><h3>Current priorities</h3></div><button className="button button-outline">All teams <ChevronDown size={14} /></button></div>{tasks.map((task) => <div className="task-row" key={task.title}><button className={`task-check ${task.done ? 'task-done' : ''}`} onClick={() => onToast('Task status updates will sync when connected')}>{task.done && <Check size={14} />}</button><div className="task-copy"><strong className={task.done ? 'task-complete' : ''}>{task.title}</strong><small>{task.who} <span>·</span> {task.when}</small></div><span className="task-tag">{task.tag}</span><button className="row-menu" aria-label="Task menu">···</button></div>)}</section></>
}

function LogisticsView({ onToast }: { onToast: (message: string) => void }) {
  const inventory = [{ item: 'Pop-up canopy', category: 'Event equipment', condition: 'Good', count: '1 unit' }, { item: 'First-aid kits', category: 'Caravan supplies', condition: 'Restock soon', count: '2 kits' }, { item: 'Reusable name badges', category: 'Meeting materials', condition: 'Good', count: '48 units' }, { item: 'Portable speaker', category: 'Event equipment', condition: 'Good', count: '1 unit' }]
  return <><PageHeading eyebrow="READY FOR WHAT’S NEXT" title="Tools & logistics" subtitle="Track the materials and equipment that help the club show up." action="Add an item" onAction={() => onToast('Inventory updates will be connected to Supabase')} /><div className="task-summary"><div className="task-summary-card"><span>INVENTORY ITEMS</span><strong>24</strong></div><div className="task-summary-card"><span>CHECKED OUT</span><strong>6</strong></div><div className="task-summary-card"><span>NEEDS ATTENTION</span><strong>2</strong></div></div><section className="surface table-card"><div className="card-heading logistics-heading"><div><div className="eyebrow">CLUB INVENTORY</div><h3>Equipment & materials</h3></div><button className="button button-outline" onClick={() => onToast('Purchase request sent to Treasurer (demo)')}><Plus size={14} /> Request purchase</button></div><div className="table-scroll"><table><thead><tr><th>ITEM</th><th>CATEGORY</th><th>CONDITION</th><th>QUANTITY</th><th /></tr></thead><tbody>{inventory.map((item) => <tr key={item.item}><td><div className="inventory-name"><span><Package size={16} /></span><strong>{item.item}</strong></div></td><td>{item.category}</td><td><span className={`status-pill ${item.condition === 'Good' ? 'status-active' : 'status-pending'}`}><i />{item.condition}</span></td><td>{item.count}</td><td><button className="row-menu" aria-label={`More about ${item.item}`}>···</button></td></tr>)}</tbody></table></div><div className="finance-note"><Coins size={15} /><span>Logistics tracks items and purchase requests. Treasurer records payments and financial receipts.</span></div></section></>
}

function SimpleView({ title, subtitle, icon, action, onAction }: { title: string; subtitle: string; icon: ReactNode; action: string; onAction: () => void }) {
  return <><PageHeading eyebrow="CLUB LIFE" title={title} subtitle={subtitle} action={action} onAction={onAction} /><div className="surface empty-feature"><div className="empty-icon">{icon}</div><div className="eyebrow">A SPACE FOR THE WHOLE CLUB</div><h2>Make room for what’s next.</h2><p>This workspace is being prepared for BAC. Once the backend is connected, updates will be shared with the right people and stay in sync across devices.</p><button className="button button-primary" onClick={onAction}><Plus size={15} />{action}</button></div></>
}

export default App
