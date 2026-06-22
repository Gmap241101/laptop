import './index.css'; // 테일윈드 스타일 연결을 위한 줄 추가
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Laptop,
  LayoutDashboard,
  Users,
  ClipboardList,
  Settings,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Edit3,
  Trash2,
  Info,
  AlertCircle,
  ShieldCheck,
  X
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';

// ⚠️ 본인의 Firebase 서비스 Config 키값으로 채워 넣으세요.
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyA-hQv4mZwrTWUn10aiS3QSLgwSWzBNds0",
      authDomain: "laptop-system-mk.firebaseapp.com",
      projectId: "laptop-system-mk",
      storageBucket: "laptop-system-mk.firebasestorage.app",
      messagingSenderId: "978421108190",
      appId: "1:978421108190:web:6bc9af49a57471ae2a614f"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'laptop-rental-app';

const STATUS = {
  AVAILABLE: '대여가능',
  REQUESTED: '신청중',
  APPROVED: '승인됨',
  ON_HOLD: '보류',
  DENIED: '불허',
  RETURNED: '반납완료',
  UNAVAILABLE: '대여불가',
};

const statusStyle = {
  '대여가능': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '신청중': 'bg-amber-50 text-amber-700 border-amber-200',
  '승인됨': 'bg-blue-50 text-blue-700 border-blue-200',
  '보류': 'bg-purple-50 text-purple-700 border-purple-200',
  '불허': 'bg-rose-50 text-rose-700 border-rose-200',
  '반납완료': 'bg-slate-100 text-slate-700 border-slate-200',
  '대여불가': 'bg-rose-100 text-rose-800 border-rose-300',
};

const today = () => new Date().toISOString().slice(0, 10);
const addDaysFrom = (dateStr, days) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

function getSeedLaptops() {
  return Array.from({ length: 8 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const makers = ['LG Gram 16 Pro', 'Samsung Galaxy Book 4', 'Dell Latitude 5540', 'Lenovo ThinkPad L14'];
    return {
      assetNo: `LAPTOP-2026-${n}`,
      serialNo: `SN-2026-${10000 + i * 37}`,
      model: makers[i % makers.length],
      manufactureDate: `2026-03-15`,
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: i % 4 === 0 ? '고속 PD 어댑터 포함' : '',
      status: STATUS.AVAILABLE,
    };
  });
}

const initialData = {
  teams: ['교무기획팀', '교육정보팀', '연구부', '행정실'],
  borrowers: [
    { name: '김민준', team: '교무기획팀' },
    { name: '이서연', team: '교육정보팀' },
    { name: '박지훈', team: '연구부' }
  ],
  settings: { teamInputMode: 'dropdown', borrowerInputMode: 'dropdown', maxRentalDays: 14 }
};

function Card({ children, className = '' }) { return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>{children}</div>; }
function CardContent({ children, className = '' }) { return <div className={`p-6 ${className}`}>{children}</div>; }
function Badge({ children }) { return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${statusStyle[children] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>{children}</span>; }

function StatCard({ icon: Icon, label, value, tone = 'slate' }) {
  const toneMap = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    rose: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`rounded-2xl p-3 border ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}><Icon className={toneMap[tone].split(' ')[1]} size={22} /></div>
        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
          <div className="text-2xl font-bold text-slate-900 mt-0.5">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Button({ children, className = '', onClick, variant = 'primary', ...props }) {
  const baseStyle = "inline-flex items-center justify-center gap-2 font-medium rounded-xl text-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none px-4 py-2.5";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-100",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
    dangerOutline: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
  };
  return <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function App() {
  const [user, setUser] = useState(null);
  const [laptops, setLaptops] = useState([]);
  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({ teams: [], borrowers: [], settings: { maxRentalDays: 14 } });

  const [view, setView] = useState('user');
  const [query, setQuery] = useState('');
  const [selectedLaptopId, setSelectedLaptopId] = useState(null);
  const [form, setForm] = useState({ team: '', borrower: '', startDate: today(), dueDate: addDaysFrom(today(), 7), purpose: '' });
  const [adminTab, setAdminTab] = useState('dashboard');
  const [newLaptop, setNewLaptop] = useState(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [toast, setToast] = useState(null);

  // 💡 범인 검거 구역: ID를 바탕으로 선택된 노트북 오브젝트를 찾아주는 메모이제이션 변수 완벽 추가!
  const selectedLaptop = useMemo(() => {
    return laptops.find(l => l.id === selectedLaptopId) || null;
  }, [laptops, selectedLaptopId]);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;
    const path = `artifacts/${appId}/public/data`;
    
    const unsubLaptops = onSnapshot(collection(db, `${path}/laptops`), snapshot => {
      setLaptops(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubRequests = onSnapshot(collection(db, `${path}/requests`), snapshot => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRequests(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
    });

    const unsubMeta = onSnapshot(doc(db, `${path}/config/metadata`), docSnap => {
      if (docSnap.exists()) setMeta(docSnap.data());
      else setDoc(doc(db, `${path}/config/metadata`), initialData);
    });

    return () => { unsubLaptops(); unsubRequests(); unsubMeta(); };
  }, [user]);

  const blockedLaptopIds = useMemo(() => new Set(requests.filter(r => ['신청중', '승인됨', '보류'].includes(r.status)).map(r => r.laptopId)), [requests]);

  const stats = useMemo(() => ({
    total: laptops.length,
    available: laptops.filter(l => !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE).length,
    requested: requests.filter(r => r.status === STATUS.REQUESTED).length,
    approved: requests.filter(r => r.status === STATUS.APPROVED).length,
    overdue: requests.filter(r => r.status === STATUS.APPROVED && r.dueDate < today()).length,
  }), [laptops, requests, blockedLaptopIds]);

  const triggerToast = (msg) => {
    setToast({ message: msg });
    setTimeout(() => setToast(null), 3000);
  };

  const submitRequest = async () => {
    if (!selectedLaptop || blockedLaptopIds.has(selectedLaptop.id)) return;
    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/requests`), {
        laptopId: selectedLaptop.id,
        assetNo: selectedLaptop.assetNo,
        team: form.team,
        borrower: form.borrower,
        startDate: form.startDate,
        dueDate: form.dueDate,
        purpose: form.purpose,
        status: STATUS.REQUESTED,
        adminMemo: '',
        timestamp: Date.now(),
        requestedAt: new Date().toLocaleString('ko-KR'),
      });
      setSelectedLaptopId(null);
      triggerToast('신청 완료');
    } catch(e) { triggerToast('실패'); }
  };

  const updateRequest = async (id, status) => {
    await updateDoc(doc(db, `artifacts/${appId}/public/data/requests`, id), { status });
    triggerToast('저장 완료');
  };

  const createLaptop = async () => {
    if (!newLaptop || !newLaptop.assetNo) return;
    await setDoc(doc(db, `artifacts/${appId}/public/data/laptops`, `NB-${Date.now()}`), {
      ...newLaptop,
      status: STATUS.AVAILABLE,
      photo: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80',
      manufactureDate: today()
    });
    setNewLaptop(null);
    triggerToast('등록 성료');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file || !window.XLSX) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const workbook = window.XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
      const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
      for (const row of rows) {
        const assetNo = row['자산관리번호'] || row['assetNo'];
        if (assetNo) {
          await setDoc(doc(db, `artifacts/${appId}/public/data/laptops`, `NB-UP-${Date.now()}-${Math.random().toString(36).substr(2,4)}`), {
            assetNo,
            model: row['모델명'] || '미지정',
            serialNo: row['시리얼번호'] || 'S/N',
            manufactureDate: today(),
            status: STATUS.AVAILABLE,
            photo: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80',
            note: row['비고'] || ''
          });
        }
      }
      setShowUploadPanel(false);
      triggerToast('일괄 업로드 완수');
    };
    reader.readAsArrayBuffer(file);
  };

  const resetDemo = async () => {
    for (const l of laptops) await deleteDoc(doc(db, `artifacts/${appId}/public/data/laptops`, l.id));
    for (const item of getSeedLaptops()) await setDoc(doc(db, `artifacts/${appId}/public/data/laptops`, `NB-${Math.random().toString(36).substr(2,5)}`), item);
    await setDoc(doc(db, `artifacts/${appId}/public/data/config/metadata`), initialData);
    triggerToast('초기화 완료');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased p-6">
      <header className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm">
        <div>
          <h1 className="text-md font-bold text-slate-900">부서 노트북 임대 원장 클라우드</h1>
          <p className="text-[10px] text-slate-400 font-mono">UID: {user?.uid || 'Connecting...'}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={()=>setView('user')} variant={view==='user'?'primary':'outline'} className="text-xs">사용자 화면</Button>
          <Button onClick={()=>setView('admin')} variant={view==='admin'?'primary':'outline'} className="text-xs">관리자 모드</Button>
        </div>
      </header>

      <main className="grid grid-cols-2 gap-4 md:grid-cols-5 mb-6">
        <StatCard icon={Laptop} label="보유 자산" value={stats.total} />
        <StatCard icon={CheckCircle2} label="즉시 가능" value={stats.available} tone="green" />
        <StatCard icon={Clock} label="대기중" value={stats.requested} tone="amber" />
        <StatCard icon={ShieldCheck} label="사용중" value={stats.approved} tone="blue" />
        <StatCard icon={XCircle} label="지연중" value={stats.overdue} tone="rose" />
      </main>

      {view === 'user' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            <div className="col-span-full relative">
              <Search className="absolute left-3 top-3.5 text-slate-400" size={16} />
              <input type="text" placeholder="자산번호 또는 모델명 검색..." value={query} onChange={(e)=>setQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            </div>
            {laptops.filter(l => `${l.assetNo} ${l.model}`.toLowerCase().includes(query.toLowerCase())).map(l => {
              const blocked = blockedLaptopIds.has(l.id) || l.status === STATUS.UNAVAILABLE;
              return (
                <div key={l.id} onClick={()=>!blocked && setSelectedLaptopId(l.id)} className={`p-4 border rounded-2xl bg-white cursor-pointer transition-all duration-150 ${selectedLaptopId===l.id?'border-blue-500 ring-2 ring-blue-100 bg-blue-50/20':''} ${blocked?'opacity-50 bg-slate-50 cursor-not-allowed':''}`}>
                  <div className="flex justify-between font-bold text-sm"><span>{l.assetNo}</span><Badge>{blocked?'잠금':STATUS.AVAILABLE}</Badge></div>
                  <div className="text-xs text-slate-600 mt-1">{l.model}</div>
                  <div className="text-[11px] text-slate-400 mt-2 bg-slate-50 p-2 rounded">💡 {l.note || '특이사항 없음'}</div>
                </div>
              )
            })}
          </div>

          <Card className="lg:sticky lg:top-6">
            <CardContent className="space-y-3">
              <h3 className="text-sm font-bold">임대 신청 폼</h3>
              <div className="text-xs p-2.5 bg-slate-100 rounded-xl font-medium text-slate-700">선택 장비: {selectedLaptop?.assetNo || '❌ 아래 목록에서 기기를 선택해 주세요'}</div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">소속 팀</span>
                <input type="text" value={form.team} onChange={(e)=>setForm({...form, team:e.target.value})} placeholder="예: 교무기획팀" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">신청 사원명</span>
                <input type="text" value={form.borrower} onChange={(e)=>setForm({...form, borrower:e.target.value})} placeholder="홍길동" className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">반납 목표일</span>
                <input type="date" value={form.dueDate} onChange={(e)=>setForm({...form, dueDate:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </label>
              <Button onClick={submitRequest} disabled={!selectedLaptop} className="w-full text-xs mt-2">서버 신청서 전송</Button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
          <div className="space-y-1">
            {['dashboard', 'requests', 'laptops'].map(t => <Button key={t} variant={adminTab===t?'primary':'ghost'} onClick={()=>setAdminTab(t)} className="w-full justify-start text-xs">{t.toUpperCase()}</Button>)}
            <Button variant="dangerOutline" onClick={resetDemo} className="w-full justify-start text-xs mt-4">원격 DB 공초</Button>
          </div>

          <Card><CardContent>
            {adminTab === 'dashboard' && (
              <div className="text-sm p-4 bg-slate-50 rounded-xl text-slate-600">
                📊 대시보드가 정상 작동 중입니다. 상단 통계 수치 및 메뉴를 이용하세요.
              </div>
            )}

            {adminTab === 'requests' && requests.map(r => (
              <div key={r.id} className="p-3 border-b flex justify-between items-center text-xs">
                <div><b>{r.assetNo}</b> ({r.team} {r.borrower}) <div className="text-[10px] text-slate-400">기한: {r.dueDate}</div></div>
                <div className="flex gap-1"><Button onClick={()=>updateRequest(r.id, STATUS.APPROVED)} className="px-2 py-1 text-[10px]">승인</Button><Button onClick={()=>updateRequest(r.id, STATUS.RETURNED)} variant="outline" className="px-2 py-1 text-[10px]">반납</Button></div>
              </div>
            ))}

            {adminTab === 'laptops' && (
              <div className="space-y-4">
                <div className="flex justify-between"><Button onClick={()=>setShowUploadPanel(!showUploadPanel)} variant="outline" className="text-xs">엑셀 올리기</Button><Button onClick={()=>setNewLaptop({assetNo:'', model:'', serialNo:'', note:''})} className="text-xs">기기 추가</Button></div>
                {showUploadPanel && <div className="p-4 border-2 border-dashed rounded-xl text-center"><input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} /></div>}
                {newLaptop && (
                  <div className="p-4 border rounded-xl space-y-3 bg-slate-50/50">
                    <label className="block"><span className="text-xs font-bold text-slate-600">자산관리번호</span><input type="text" value={newLaptop.assetNo} onChange={(e)=>setNewLaptop({...newLaptop, assetNo:e.target.value})} className="w-full p-2 border rounded-lg mt-1 text-xs bg-white" placeholder="LAPTOP-2026-XX" /></label>
                    <label className="block"><span className="text-xs font-bold text-slate-600">모델명</span><input type="text" value={newLaptop.model} onChange={(e)=>setNewLaptop({...newLaptop, model:e.target.value})} className="w-full p-2 border rounded-lg mt-1 text-xs bg-white" placeholder="삼성 갤럭시북" /></label>
                    <Button onClick={createLaptop} className="text-xs w-full">서버에 자산 등록</Button>
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  {laptops.map(l => <div key={l.id} className="p-3 border rounded-xl flex justify-between items-center bg-white shadow-sm"><span><b>{l.assetNo}</b> - {l.model}</span><Button onClick={async()=>await deleteDoc(doc(db, `artifacts/${appId}/public/data/laptops`, l.id))} variant="dangerOutline" className="px-2 py-1 text-[10px]">삭제</Button></div>)}
                </div>
              </div>
            )}
          </CardContent></Card>
        </div>
      )}

      <AnimatePresence>
        {toast && <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs px-4 py-2 rounded-xl shadow-lg">{toast.message}</motion.div>}
      </AnimatePresence>
    </div>
  );
}

export default App;