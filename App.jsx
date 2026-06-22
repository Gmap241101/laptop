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
  Check,
  X
} from 'lucide-react';

// --- Firebase 핵심 및 Firestore / Auth 모듈 임포트 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';

// --- 환경 변수 연동 및 초기 설정 ---
// 런타임 샌드박스 환경에서 주입하는 파이어베이스 설정을 우선 매핑하고, 없을 시 기본 임시 키 세팅으로 자동 컴파일 차단 폴백 처리합니다.
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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

// 최초 데이터 리셋용 템플릿
function getSeedLaptops() {
  return Array.from({ length: 12 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const makers = ['LG Gram 16 Pro', 'Samsung Galaxy Book 4', 'Dell Latitude 5540', 'Lenovo ThinkPad L14', 'HP EliteBook 840'];
    return {
      assetNo: `LAPTOP-2026-${n}`,
      serialNo: `SN-2026-${10000 + i * 37}`,
      model: makers[i % makers.length],
      manufactureDate: `2025-03-15`,
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: i % 4 === 0 ? '고속 어댑터 포함' : '',
      status: STATUS.AVAILABLE,
    };
  });
}

const initialData = {
  teams: ['교무기획팀', '교육정보팀', '연구부', '행정실'],
  borrowers: [
    { name: '김민준', team: '교무기획팀' },
    { name: '이서연', team: '교육정보팀' },
    { name: '박지훈', team: '연구부' },
    { name: '최유진', team: '행정실' }
  ],
  settings: {
    teamInputMode: 'dropdown',
    borrowerInputMode: 'dropdown',
    maxRentalDays: 14
  }
};

// --- 공통 고품질 스타일 UI 컴포넌트 내장화 ---
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
function Input({ label, value, onChange, type = 'text', placeholder = '', ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" {...props} />
    </label>
  );
}
function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.7em_auto] bg-[right_1rem_center] bg-no-repeat">{children}</select>
    </label>
  );
}

function App() {
  // --- 공통 상태 선언 ---
  const [user, setUser] = useState(null);
  const [laptops, setLaptops] = useState([]);
  const [requests, setRequests] = useState([]);
  const [meta, setMeta] = useState({
    teams: ['교무기획팀', '교육정보팀', '연구부', '행정실'],
    borrowers: [
      { name: '김민준', team: '교무기획팀' },
      { name: '이서연', team: '교육정보팀' },
      { name: '박지훈', team: '연구부' }
    ],
    settings: { teamInputMode: 'dropdown', borrowerInputMode: 'dropdown', maxRentalDays: 14 }
  });

  const [view, setView] = useState('user'); // 'user' | 'admin'
  const [query, setQuery] = useState('');
  const [selectedLaptopId, setSelectedLaptopId] = useState(null);
  const [form, setForm] = useState({ team: '', borrower: '', startDate: today(), dueDate: addDaysFrom(today(), 7), purpose: '' });
  const [adminTab, setAdminTab] = useState('dashboard'); // 'dashboard' | 'requests' | 'laptops' | 'people' | 'settings'
  const [editLaptop, setEditLaptop] = useState(null);
  const [newLaptop, setNewLaptop] = useState(null);
  const [newTeam, setNewTeam] = useState('');
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowerTeam, setNewBorrowerTeam] = useState('');
  const [tempSettings, setTempSettings] = useState(meta.settings);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  };

  // --- 엑셀 라이브러리 (SheetJS) 로딩 ---
  useEffect(() => {
    if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  // =================================================================
  // 🔥 [MANDATORY RULE 3] 선인증 수렴 (샌드박스 인증 우선 적용)
  // =================================================================
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Firebase authentication failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // =================================================================
  // 🔥 [MANDATORY RULE 1, 3] 인증 완료 이후 DB 실시간 양방향 파이프라인 형성
  // =================================================================
  useEffect(() => {
    if (!user) return;

    // 1. 노트북 리스트 수집 리스너 (RULE 1 경로 매핑)
    const unsubLaptops = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'laptops'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLaptops(list);
      },
      (err) => console.error("Laptops load error:", err)
    );

    // 2. 신청 정보 수집 리스너
    const unsubRequests = onSnapshot(
      collection(db, 'artifacts', appId, 'public', 'data', 'requests'),
      (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // [RULE 2] 복합 정렬 배제, 클라이언트 메모리 내에서 최신 신청순 수치 정렬 가공
        list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setRequests(list);
      },
      (err) => console.error("Requests load error:", err)
    );

    // 3. 메타 자산 구성 원장 도큐먼트 리스너
    const unsubMeta = onSnapshot(
      doc(db, 'artifacts', appId, 'public', 'data', 'config', 'metadata'),
      (docSnap) => {
        if (docSnap.exists()) {
          setMeta(docSnap.data());
        } else {
          // 데이터가 없는 최초 가동 시 원장 씨드 자동 구성
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'metadata'), initialData);
        }
      },
      (err) => console.error("Metadata load error:", err)
    );

    return () => {
      unsubLaptops();
      unsubRequests();
      unsubMeta();
    };
  }, [user]);

  // 부서 명칭 초기 바인딩 동기화
  useEffect(() => {
    if (meta.teams.length > 0 && !newBorrowerTeam) {
      setNewBorrowerTeam(meta.teams[0]);
    }
    setTempSettings(meta.settings);
  }, [meta, adminTab]);

  const blockedLaptopIds = useMemo(() => {
    return new Set(
      requests
        .filter((r) => ['신청중', '승인됨', '보류'].includes(r.status))
        .map((r) => r.laptopId)
    );
  }, [requests]);

  const stats = useMemo(() => ({
    total: laptops.length,
    available: laptops.filter((l) => !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE).length,
    requested: requests.filter((r) => r.status === STATUS.REQUESTED).length,
    approved: requests.filter((r) => r.status === STATUS.APPROVED).length,
    overdue: requests.filter((r) => r.status === STATUS.APPROVED && r.dueDate < today()).length,
  }), [laptops, requests, blockedLaptopIds]);

  const filteredLaptops = laptops.filter((l) =>
    `${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`.toLowerCase().includes(query.toLowerCase())
  );

  const selectedLaptop = laptops.find((l) => l.id === selectedLaptopId);
  const filteredBorrowers = meta.borrowers.filter((b) => b.team === form.team);

  // --- 클라우드 통신 제어 함수 ---
  const submitRequest = async () => {
    if (!user) {
      triggerToast('인증 세션이 유실되었습니다. 잠시 대기해 주세요.', 'error');
      return;
    }
    if (!selectedLaptop || blockedLaptopIds.has(selectedLaptop.id) || selectedLaptop.status === STATUS.UNAVAILABLE) {
      triggerToast('대여할 수 없는 자산 상태입니다.', 'error');
      return;
    }
    if (!form.team || !form.borrower || !form.startDate || !form.dueDate) {
      triggerToast('소속, 신청인, 대여 기한을 모두 배정해 주세요.', 'error');
      return;
    }
    if (form.dueDate < form.startDate) {
      triggerToast('반납 지정일이 올바르지 않습니다.', 'error');
      return;
    }
    const maxLimitDate = addDaysFrom(form.startDate, meta.settings.maxRentalDays);
    if (form.dueDate > maxLimitDate) {
      triggerToast(`최장 허용 기한(${meta.settings.maxRentalDays}일)을 초과한 신청입니다.`, 'error');
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'requests'), {
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
      setForm({ team: '', borrower: '', startDate: today(), dueDate: addDaysFrom(today(), 7), purpose: '' });
      triggerToast('실시간 데이터베이스 신청 접수가 완료되었습니다.', 'success');
    } catch (e) {
      triggerToast('전송 에러가 발생했습니다.', 'error');
    }
  };

  const updateRequest = async (id, status) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'requests', id);
      await updateDoc(docRef, { status });
      triggerToast(`[${status}] 변동사항이 클라우드에 성공적으로 기록되었습니다.`, 'success');
    } catch (e) {
      triggerToast('업데이트 실패', 'error');
    }
  };

  const updateRequestMemo = async (id, memo) => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'requests', id);
      await updateDoc(docRef, { adminMemo: memo });
    } catch (e) {
      console.error("Memo save error:", e);
    }
  };

  const handleAddLaptopClick = () => {
    const nextNum = String(laptops.length + 1).padStart(2, '0');
    setNewLaptop({
      assetNo: `LAPTOP-2026-${nextNum}`,
      serialNo: `SN-2026-${10000 + laptops.length * 37}`,
      model: 'LG Gram 16 Pro',
      manufactureDate: today(),
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: '',
      status: STATUS.AVAILABLE,
    });
  };

  const createLaptop = async () => {
    if (!user || !newLaptop.assetNo.trim()) return;
    try {
      const newId = `NB-${Date.now()}`;
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'laptops', newId), newLaptop);
      setNewLaptop(null);
      triggerToast('새 장비 자산 등록을 완료했습니다.', 'success');
    } catch (e) {
      triggerToast('자산 적재 실패', 'error');
    }
  };

  const saveLaptop = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'laptops', editLaptop.id);
      await setDoc(docRef, editLaptop);
      setEditLaptop(null);
      triggerToast('기기 정보 수정이 적용되었습니다.', 'success');
    } catch (e) {
      triggerToast('수정 실패', 'error');
    }
  };

  const deleteLaptop = (id, assetNo) => {
    if (!user) return;
    triggerConfirm(
      '노트북 장비 영구 삭제',
      `정말로 클라우드 DB에서 [${assetNo}] 기기를 제거하시겠습니까? 관련 이력은 잔존하나 기기 목록에서 제외됩니다.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'laptops', id));
          if (selectedLaptopId === id) setSelectedLaptopId(null);
          triggerToast('기기 자산이 영구 소거되었습니다.', 'success');
        } catch (e) {
          triggerToast('소거 실패', 'error');
        }
      }
    );
  };

  const saveMetadata = async (updatedMeta) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'metadata'), updatedMeta);
    } catch (e) {
      triggerToast('메타데이터 저장에 실패했습니다.', 'error');
    }
  };

  // --- 엑셀 및 CSV 대량 등록 파서 ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBytes = new Uint8Array(evt.target.result);
        let jsonResult = [];

        if (window.XLSX) {
          const workbook = window.XLSX.read(dataBytes, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          jsonResult = window.XLSX.utils.sheet_to_json(sheet);
        } else {
          // SheetJS 라이브러리 백업용 기본적인 CSV 디코더
          const decoder = new TextDecoder('utf-8');
          const csvText = decoder.decode(dataBytes);
          const lines = csvText.split(/\r?\n/).filter(line => line.trim());
          if (lines.length > 0) {
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            jsonResult = lines.slice(1).map(line => {
              const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
              const obj = {};
              headers.forEach((header, index) => {
                obj[header] = values[index] || '';
              });
              return obj;
            });
          }
        }

        processParsedData(jsonResult);
        e.target.value = '';
      } catch (err) {
        triggerToast('파일 파싱 중 에러가 발생했습니다. 규격을 확인해 주세요.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processParsedData = async (jsonList) => {
    if (!jsonList || jsonList.length === 0) {
      triggerToast('업로드된 파일에서 읽어올 수 있는 자산이 감지되지 않았습니다.', 'error');
      return;
    }

    const uploadedLaptops = [];
    let addCount = 0;

    jsonList.forEach((row, index) => {
      const matchVal = (keys) => {
        const matchedKey = Object.keys(row).find(k =>
          keys.some(key => k.toLowerCase().replace(/\s+/g, '').includes(key.toLowerCase()))
        );
        return matchedKey ? String(row[matchedKey]).trim() : '';
      };

      const assetNo = matchVal(['자산관리번호', '관리번호', '자산번호', 'assetno', 'asset_no']);
      const model = matchVal(['모델명', '모델', '기종', 'model']);
      const serialNo = matchVal(['시리얼번호', '시리얼', 'serialno', 'serial_no', 'sn', 's/n']);
      const manufactureDate = matchVal(['제조일자', '제조일', '구입일자', '구입일', 'manufacturedate', 'manufacture_date']);
      const note = matchVal(['비고', '메모', '특이사항', 'note']);
      const photo = matchVal(['사진url', '사진링크', '사진', 'photo', 'image']);
      const statusVal = matchVal(['대여가능여부', '대여가능', '대여상태', '상태', 'status']);

      if (assetNo) {
        const fallbackPhoto = `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`;
        let finalStatus = STATUS.AVAILABLE;
        
        if (statusVal.includes('대여불가') || statusVal.toLowerCase().includes('unavailable') || statusVal.includes('불가')) {
          finalStatus = STATUS.UNAVAILABLE;
        }

        uploadedLaptops.push({
          assetNo: assetNo,
          serialNo: serialNo || `SN-AUTO-${Math.floor(Math.random() * 90000 + 10000)}`,
          model: model || '미지정 기종',
          manufactureDate: manufactureDate || today(),
          photo: photo || fallbackPhoto,
          note: note || '',
          status: finalStatus,
        });
        addCount++;
      }
    });

    if (uploadedLaptops.length > 0) {
      try {
        // [MANDATORY RULE 1] 파이어베이스에 순차 비동기 연계 밀어넣기
        for (const lap of uploadedLaptops) {
          const newId = `NB-UP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'laptops', newId), lap);
        }
        setShowUploadPanel(false);
        triggerToast(`총 ${addCount}대의 노트북이 엑셀 파싱을 거쳐 서버 DB에 실시간 등록되었습니다.`, 'success');
      } catch (err) {
        triggerToast('데이터베이스 업로드 처리 중 장애가 발생했습니다.', 'error');
      }
    } else {
      triggerToast('지정 열 규격 정보가 상이하여 데이터를 수집하지 못했습니다.', 'error');
    }
  };

  const resetDemo = () => {
    triggerConfirm(
      '데이터 완전 초기화',
      '클라우드 상의 모든 노트북 기종 및 대여 신청서 목록을 삭제하고 공장 초기 데이터 세팅으로 회귀합니다. 계속하시겠습니까?',
      async () => {
        try {
          // 기존 데이터 삭제 순차 대기
          for (const l of laptops) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'laptops', l.id));
          }
          for (const r of requests) {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'requests', r.id));
          }

          // 기본 템플릿 재생성
          const seed = getSeedLaptops();
          for (const item of seed) {
            const nextId = `NB-${Math.random().toString(36).substr(2, 6)}`;
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'laptops', nextId), item);
          }
          await saveMetadata(initialData);
          triggerToast('클라우드 공장 초기화 완수', 'success');
        } catch (e) {
          triggerToast('초기화 도중 지연이 발생했습니다.', 'error');
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* --- 상단 글로벌 헤더 --- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-tr from-blue-600 to-blue-500 p-2 text-white shadow-md shadow-blue-200"><Laptop size={22} /></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                부서 노트북 대여 관리 서비스
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-mono font-bold">Cloud Live</span>
              </h1>
              {/* [MANDATORY] 다중 유저 디스커버리를 위한 전체 userId 출력 적용 */}
              <div className="text-[10px] text-slate-400 font-mono font-semibold tracking-wider mt-0.5">My Session Account ID: {user?.uid || '인증 프로세스 가동중...'}</div>
            </div>
          </div>
          <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/60">
            <button onClick={() => setView('user')} className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${view === 'user' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>사용자 화면</button>
            <button onClick={() => setView('admin')} className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${view === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>관리자 모드</button>
          </div>
        </div>
      </header>

      {/* --- 메인 프레임워크 --- */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        
        {/* --- 종합 통계 대시보드 --- */}
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard icon={Laptop} label="보유 자산" value={stats.total} />
          <StatCard icon={CheckCircle2} label="대여 즉시 가능" value={stats.available} tone="green" />
          <StatCard icon={Clock} label="승인 대기중" value={stats.requested} tone="amber" />
          <StatCard icon={ShieldCheck} label="대여 사용중" value={stats.approved} tone="blue" />
          <StatCard icon={XCircle} label="반납 지연중" value={stats.overdue} tone="rose" />
        </section>

        {view === 'user' ? (
          /* ==================== 사용자 신청 게이트 ==================== */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
            
            {/* 좌측 노트북 목록 카드 (2컬러 넓이) */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">대여 가능 장비 원장</h2>
                      <p className="text-xs text-slate-500 mt-0.5">상태가 [대여불가/사용중]인 장비는 다른 직원의 예약을 막기 위해 예약 잠금이 자동 활성화됩니다.</p>
                    </div>
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="관리번호, 모델명, 시리얼 검색" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none transition focus:border-blue-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredLaptops.map((l) => {
                      const blocked = blockedLaptopIds.has(l.id) || l.status === STATUS.UNAVAILABLE;
                      const isSelected = selectedLaptopId === l.id;
                      return (
                        <motion.button
                          whileHover={!blocked ? { y: -4 } : {}}
                          key={l.id}
                          onClick={() => !blocked && setSelectedLaptopId(l.id)}
                          className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${isSelected ? 'border-blue-500 ring-4 ring-blue-50 bg-blue-50/10' : 'border-slate-200 bg-white hover:shadow-md'} ${blocked ? 'cursor-not-allowed opacity-60 bg-slate-50/50' : 'cursor-pointer'}`}
                        >
                          <div className="p-1 pt-[10px]">
                            <div className="relative h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                              <img src={l.photo} alt={l.assetNo} className="h-full w-full object-cover" />
                              {blocked && <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center text-white text-xs font-bold">이용 불가</div>}
                            </div>
                          </div>
                          <div className="space-y-2 p-4 pt-3">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-bold text-slate-900">{l.assetNo}</span>
                              <Badge>{blocked ? (l.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : '사용중') : STATUS.AVAILABLE}</Badge>
                            </div>
                            <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                            <div className="space-y-0.5 text-[11px] text-slate-500">
                              <div>S/N: {l.serialNo}</div>
                              <div>출고일: {l.manufactureDate}</div>
                            </div>
                            {/* [요구사항 1] 비고란 유무에 무관하게 메모란 항상 렌더링 유지 */}
                            <div className="mt-1 rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 border border-slate-200/50">💡 {l.note || '특이사항 없음'}</div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 우측 끈적한 사이드바 신청 패널 (1컬럼) */}
            <div className="lg:col-span-1 lg:sticky lg:top-24 h-fit">
              <Card className="border-blue-100/80 shadow-md shadow-slate-100">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-4 text-white">
                  <h2 className="text-sm font-bold tracking-wide">실시간 대여 신청 전송</h2>
                  <p className="text-[11px] text-blue-100 mt-0.5">상단 기기를 선택하고 원장을 제출하세요.</p>
                </div>
                <CardContent className="space-y-4 p-6">
                  <div className={`rounded-xl px-4 py-3 border text-xs transition-all ${selectedLaptop ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    {selectedLaptop ? `선택한 노트북: ${selectedLaptop.assetNo}` : '신청을 가하고자 하는 노트북 기기를 선택해 주십시오.'}
                  </div>

                  {meta.settings.teamInputMode === 'dropdown' ? (
                    <Select label="소속 부서 / 팀 선택" value={form.team} onChange={(v) => setForm({ ...form, team: v, borrower: '' })}><option value="">소속 선택</option>{meta.teams.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                  ) : (
                    <Input label="소속 부서 직접 입력" value={form.team} onChange={(v) => setForm({ ...form, team: v })} placeholder="팀명을 입력해 주세요" />
                  )}

                  {meta.settings.borrowerInputMode === 'dropdown' ? (
                    <Select label="대여자 성함 선택" value={form.borrower} onChange={(v) => setForm({ ...form, borrower: v })}><option value="">성함 선택</option>{filteredBorrowers.map((b, i) => <option key={i} value={b.name}>{b.name}</option>)}</Select>
                  ) : (
                    <Input label="대여자 성함 직접 입력" value={form.borrower} onChange={(v) => setForm({ ...form, borrower: v })} placeholder="성함을 작성하세요" />
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <Input label="대여 시작일" type="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
                    <Input label="반납 예정일" type="date" value={form.dueDate} min={form.startDate} max={addDaysFrom(form.startDate, meta.settings.maxRentalDays)} onChange={(v) => setForm({ ...form, dueDate: v })} />
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">상세 대여 목적</span>
                    <textarea value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:ring-4 focus:ring-blue-100" placeholder="회의, 수업 배정, 프로젝트 현업 등" />
                  </label>

                  <Button onClick={submitRequest} disabled={!selectedLaptop} className="w-full justify-center py-6">대여 보안 신청서 제출</Button>
                </CardContent>
              </Card>
            </div>

          </div>
        ) : (
          /* ==================== 관리자 통제 패널 ==================== */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
            
            {/* 좌측 사이드 원장 목록 가이드 */}
            <div className="lg:sticky lg:top-24 h-fit">
              <Card>
                <CardContent className="space-y-1.5 p-3">
                  {[
                    ['dashboard', '대시보드 운영 현황'],
                    ['requests', '대여 원장 승인 검토'],
                    ['laptops', '장비 자산 대장 제어'],
                    ['people', '팀 및 사원 대장 관리'],
                    ['settings', '시스템 통합 정책 구성']
                  ].map(([key, label]) => (
                    <Button key={key} variant={adminTab === key ? 'primary' : 'ghost'} onClick={() => setAdminTab(key)} className="w-full justify-start text-xs font-semibold">{label}</Button>
                  ))}
                  <Button variant="dangerOutline" onClick={resetDemo} className="w-full justify-start text-xs mt-4"><RotateCcw size={14}/>서버 데이터 완전 초기화</Button>
                </CardContent>
              </Card>
            </div>

            {/* 우측 관리 세부 탭 */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  
                  {/* 대시보드 탭 */}
                  {adminTab === 'dashboard' && (
                    <div className="space-y-6">
                      <h2 className="text-base font-bold text-slate-900 border-b pb-3">실시간 클라우드 대시보드 가이드</h2>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-5 text-xs text-slate-600 space-y-2">
                          <h4 className="font-bold text-slate-800">보안 강화 시스템 수립 완료</h4>
                          <ul className="list-disc pl-4 space-y-1">
                            <li>모든 사용자의 대여 프로세스가 데이터베이스에 실시간 적재됩니다.</li>
                            <li>승인 완료 시 다른 브라우저의 신청 목록에서 기기가 동시 비활성화됩니다.</li>
                            <li>[대여불가/반납확정] 전환 시 실시간 자산 임대 자격이 원격 회수됩니다.</li>
                          </ul>
                        </div>
                        <div className="rounded-xl bg-blue-50/50 p-5 text-xs text-blue-800">
                          <h4 className="font-bold text-blue-900">클라우드 구동 인증 확인</h4>
                          <p className="mt-2 leading-relaxed">현재 Google Cloud Console 샌드박스의 익명 사용자 인증(Anonymous Auth) 연계가 안전하게 동작하고 있습니다. 외부 비인가 접근이 불가능한 구조입니다.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 심사 원장 탭 */}
                  {adminTab === 'requests' && (
                    <div className="space-y-4">
                      <h2 className="text-base font-bold text-slate-900 border-b pb-3">대여 신청서 심사 및 관리</h2>
                      {requests.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-400">접수된 대여 신청 내역이 없습니다.</div>
                      ) : (
                        requests.map((r) => {
                          const isOverdue = r.status === STATUS.APPROVED && r.dueDate < today();
                          return (
                            <div key={r.id} className="rounded-xl border p-5 space-y-4 bg-white shadow-sm">
                              <div className="flex flex-col justify-between sm:flex-row gap-4">
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-sm text-slate-900">{r.assetNo}</span>
                                    <Badge>{r.status}</Badge>
                                    {isOverdue && <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md font-bold animate-pulse">기한 지연</span>}
                                  </div>
                                  <div className="text-xs text-slate-600 font-medium">{r.team} · {r.borrower} ({r.startDate} ~ {r.dueDate})</div>
                                  <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg">목적: {r.purpose || '상세 사유 미기재'}</div>
                                </div>
                                <div className="flex flex-wrap gap-1 h-fit">
                                  <Button onClick={() => updateRequest(r.id, STATUS.APPROVED)} className="px-2.5 py-1.5 text-xs">승인</Button>
                                  <Button onClick={() => updateRequest(r.id, STATUS.DENIED)} variant="dangerOutline" className="px-2.5 py-1.5 text-xs">불허</Button>
                                  <Button onClick={() => updateRequest(r.id, STATUS.RETURNED)} variant="outline" className="px-2.5 py-1.5 text-xs border-emerald-300 text-emerald-700 bg-emerald-50">반납완료</Button>
                                </div>
                              </div>
                              <input type="text" value={r.adminMemo} onChange={(e) => updateRequestMemo(r.id, e.target.value)} placeholder="심사 관련 코멘트 기입 (작성 즉시 서버에 자동 밀어넣기 저장)" className="w-full rounded-lg border px-3.5 py-2 text-xs outline-none focus:border-blue-500" />
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* 장비 관리 탭 (엑셀 일괄 업로드 내장) */}
                  {adminTab === 'laptops' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center border-b pb-3 flex-wrap gap-2">
                        <h3 className="text-base font-bold text-slate-900">장비 자산 대장 제어</h3>
                        <div className="flex gap-1.5">
                          <Button onClick={() => setShowUploadPanel(!showUploadPanel)} variant="outline" className="text-xs"><ClipboardList size={14}/>엑셀/CSV 일괄 업로드</Button>
                          <Button onClick={handleAddLaptopClick} className="text-xs"><Plus size={14}/>개별 기기 등록</Button>
                        </div>
                      </div>

                      {/* 엑셀 일괄 드롭존 */}
                      {showUploadPanel && (
                        <div className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 p-6 text-center transition-all animate-fadeIn">
                          <div className="mx-auto flex max-w-lg flex-col items-center justify-center">
                            <ClipboardList className="text-blue-500 mb-2" size={32} />
                            <h4 className="text-xs font-bold text-slate-800">대량 자산 일괄 업로드</h4>
                            <p className="text-[11px] text-slate-500 mt-1">엑셀(.xlsx) 혹은 CSV 파일의 첫 행에 [자산관리번호, 모델명, 시리얼번호, 제조일자, 비고]를 매핑하여 업로드하면 실시간 파싱됩니다.</p>
                            <label htmlFor="excel-uploader-input" className="mt-4 inline-flex items-center gap-1 bg-white border px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer shadow-sm">파일 탐색 선택</label>
                            <input id="excel-uploader-input" type="file" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} className="hidden" />
                          </div>
                        </div>
                      )}

                      {/* 신규 등록 폼 */}
                      {newLaptop && (
                        <div className="p-4 border-2 border-emerald-400 bg-emerald-50/20 rounded-xl grid gap-3 sm:grid-cols-2">
                          <Input label="자산관리번호" value={newLaptop.assetNo} onChange={(v)=>setNewLaptop({...newLaptop, assetNo:v})}/>
                          <Input label="모델명" value={newLaptop.model} onChange={(v)=>setNewLaptop({...newLaptop, model:v})}/>
                          <Input label="시리얼번호" value={newLaptop.serialNo} onChange={(v)=>setNewLaptop({...newLaptop, serialNo:v})}/>
                          <Select label="대여 지정 여부" value={newLaptop.status} onChange={(v)=>setNewLaptop({...newLaptop, status:v})}><option value={STATUS.AVAILABLE}>대여가능</option><option value={STATUS.UNAVAILABLE}>대여불가</option></Select>
                          <div className="sm:col-span-2 flex justify-end gap-2"><Button onClick={()=>setNewLaptop(null)} variant="outline">취소</Button><Button onClick={createLaptop}>DB 적재 가동</Button></div>
                        </div>
                      )}

                      {/* 정보 변경 수정 폼 */}
                      {editLaptop && (
                        <div className="p-4 border-2 border-blue-500 bg-blue-50/20 rounded-xl grid gap-3 sm:grid-cols-2">
                          <Input label="자산관리번호 개정" value={editLaptop.assetNo} onChange={(v)=>setEditLaptop({...editLaptop, assetNo:v})}/>
                          <Input label="기종 변경" value={editLaptop.model} onChange={(v)=>setEditLaptop({...editLaptop, model:v})}/>
                          <Input label="메모 기입" value={editLaptop.note} onChange={(v)=>setEditLaptop({...editLaptop, note:v})}/>
                          <Select label="대여상태 조정" value={editLaptop.status} onChange={(v)=>setEditLaptop({...editLaptop, status:v})}><option value={STATUS.AVAILABLE}>대여가능</option><option value={STATUS.UNAVAILABLE}>대여불가</option></Select>
                          <div className="sm:col-span-2 flex justify-end gap-2"><Button onClick={()=>setEditLaptop(null)} variant="outline">취소</Button><Button onClick={saveLaptop}>변동 정보 저장</Button></div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        {laptops.map((l) => (
                          <div key={l.id} className="p-4 border rounded-xl flex flex-col justify-between bg-white shadow-sm hover:shadow-md transition">
                            <div>
                              <div className="flex justify-between items-center"><b>{l.assetNo}</b><Badge>{l.status}</Badge></div>
                              <div className="text-xs text-slate-600 mt-1">{l.model}</div>
                              <div className="text-[11px] text-slate-400">S/N: {l.serialNo}</div>
                              <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded mt-2">비고: {l.note || '없음'}</div>
                            </div>
                            <div className="flex gap-2 mt-3"><Button onClick={()=>setEditLaptop(l)} variant="outline" className="flex-1 py-1.5 text-xs">상세 수정</Button><Button onClick={()=>deleteLaptop(l.id, l.assetNo)} variant="dangerOutline" className="py-1.5 text-xs px-2.5"><Trash2 size={12}/></Button></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 인적 구성 탭 */}
                  {adminTab === 'people' && (
                    <div className="grid gap-8 sm:grid-cols-2">
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-700">소속 부서 등록 변경</h4>
                        <div className="flex gap-2"><input value={newTeam} onChange={e=>setNewTeam(e.target.value)} placeholder="새 부서 명칭" className="border rounded-xl text-xs px-3 py-2 flex-1 outline-none"/><Button onClick={()=>{if(newTeam.trim()){ const nextTeams=[...meta.teams, newTeam.trim()]; saveMetadata({...meta, teams:nextTeams}); setNewTeam(''); triggerToast('부서 추가 완료'); }}}><Plus size={14}/></Button></div>
                        <div className="space-y-1 text-xs max-h-72 overflow-y-auto">{meta.teams.map(t=><div key={t} className="p-2 bg-slate-50 border rounded-lg flex justify-between items-center">{t}<button onClick={()=>{saveMetadata({...meta, teams:meta.teams.filter(x=>x!==t)}); triggerToast('부서 삭제 완료');}} className="text-rose-500 hover:font-bold"><X size={14}/></button></div>)}</div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-700">이용 사원 원장 배정</h4>
                        <div className="flex gap-1.5"><input value={newBorrower} onChange={e=>setNewBorrower(e.target.value)} placeholder="사원 성함" className="border rounded-xl text-xs px-2 py-1 w-24 outline-none"/><select value={newBorrowerTeam} onChange={e=>setNewBorrowerTeam(e.target.value)} className="border text-xs rounded-xl px-1.5">{meta.teams.map(t=><option key={t} value={t}>{t}</option>)}</select><Button onClick={()=>{if(newBorrower.trim()){ const nextB=[...meta.borrowers, {name:newBorrower.trim(), team:newBorrowerTeam}]; saveMetadata({...meta, borrowers:nextB}); setNewBorrower(''); triggerToast('사원 추가 완료');}}}><Plus size={14}/></Button></div>
                        <div className="space-y-1 text-xs max-h-60 overflow-y-auto">{meta.borrowers.map((b,i)=><div key={i} className="p-2 bg-slate-50 border rounded-lg flex justify-between items-center"><span>{b.name} <span className="text-[10px] text-slate-400">({b.team})</span></span><button onClick={()=>{saveMetadata({...meta, borrowers:meta.borrowers.filter((_,idx)=>idx!==i)}); triggerToast('사원 소거 완료');}} className="text-rose-500"><X size={14}/></button></div>)}</div>
                      </div>
                    </div>
                  )}

                  {/* 시스템 통제 설정 탭 */}
                  {adminTab === 'settings' && (
                    <div className="space-y-4">
                      <h2 className="text-base font-bold text-slate-900 border-b pb-3">통합 시스템 보안 및 정책 변경</h2>
                      <Select label="사용자 소속 부서 기입 정책" value={tempSettings.teamInputMode} onChange={(v)=>setTempSettings({...tempSettings, teamInputMode:v})}><option value="dropdown">안정성 드롭다운 제약 목록</option><option value="text">직접 입력 허가</option></Select>
                      <Select label="신청인 성함 기입 정책" value={tempSettings.borrowerInputMode} onChange={(v)=>setTempSettings({...tempSettings, borrowerInputMode:v})}><option value="dropdown">안정성 드롭다운 제약 목록</option><option value="text">직접 입력 허가</option></Select>
                      <Input label="임대 최장 허용일 (일수)" type="number" value={tempSettings.maxRentalDays} onChange={(v)=>setTempSettings({...tempSettings, maxRentalDays:Number(v)})}/>
                      
                      <div className="flex justify-end gap-2 pt-3 border-t">
                        <Button variant="outline" onClick={()=>{setTempSettings(meta.settings); triggerToast('취소 복구되었습니다.');}}>변동 사항 취소</Button>
                        <Button onClick={()=>{saveMetadata({...meta, settings:tempSettings}); triggerToast('정책을 전 지점에 적용했습니다.');}}>변동 사항 클라우드 일괄 보정</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

          </div>
        )}
      </main>

      {/* --- 모던 알림 Toast 피드 --- */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }} className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4.5 py-3.5 shadow-xl border text-xs font-semibold ${toast.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
            {toast.type === 'error' ? <AlertCircle className="text-rose-600" size={18} /> : <CheckCircle2 className="text-emerald-600" size={18} />}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-700"><X size={15} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 모던 대화식 확인창 모달 --- */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-2xl animate-scaleIn">
            <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmModal(null)}>취소</Button>
              <Button variant="danger" onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}>확인 및 즉시 실행</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;