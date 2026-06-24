import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
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
  Save,
  Trash2,
  Edit3,
  ShieldCheck,
  AlertCircle,
  X,
  Info
} from 'lucide-react';

const firebaseConfig = {
  apiKey: "AIzaSyA-hQv4mZwrTWUn10aiS3QSLgwSWzBNds0",
  authDomain: "laptop-system-mk.firebaseapp.com",
  projectId: "laptop-system-mk",
  storageBucket: "laptop-system-mk.firebasestorage.app",
  messagingSenderId: "978421108190",
  appId: "1:978421108190:web:6bc9af49a57471ae2a614f"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const DATA_DOC_REF = doc(db, 'laptopRentalDashboard', 'main');

// --- 상태 및 스타일 정의 ---
const STATUS = {
  AVAILABLE: '대여가능',
  REQUESTED: '신청중',
  APPROVED: '대여중',
  ON_HOLD: '보류',
  DENIED: '불허',
  RETURNED: '반납완료',
  UNAVAILABLE: '대여불가',
};

const statusStyle = {
  '대여가능': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '신청중': 'bg-amber-50 text-amber-700 border-amber-200',
  '대여중': 'bg-blue-50 text-blue-700 border-blue-200',
  '보류': 'bg-purple-50 text-purple-700 border-purple-200',
  '불허': 'bg-rose-50 text-rose-700 border-rose-200',
  '반납완료': 'bg-slate-100 text-slate-700 border-slate-200',
  '대여불가': 'bg-rose-100 text-rose-800 border-rose-300',
};

const KOREA_TIME_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_MAX_RENTAL_DAYS = 14;
const DEFAULT_ADJUST_START_DATE_AFTER_WORK_END = true;
const DEFAULT_WORK_END_TIME = '18:00';

const formatDate = (date) => date.toISOString().slice(0, 10);

const getKoreaNow = () => new Date(Date.now() + KOREA_TIME_OFFSET_MS);

const today = () => formatDate(getKoreaNow());

const addDays = (days) => addDaysFrom(today(), days);

// 특정 날짜 문자열 기준으로 일수를 더하는 헬퍼 함수
const addDaysFrom = (dateStr, days) => {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return formatDate(d);
};

const parseTimeToMinutes = (timeString) => {
  const [hours, minutes] = String(timeString || DEFAULT_WORK_END_TIME)
    .split(':')
    .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 18 * 60;
  }

  return hours * 60 + minutes;
};

// 한국시간 기준 설정된 업무 종료 시간을 넘으면 다음날을 기본 대여 시작일로 사용
const isKoreaNowAfterTime = (timeString) => {
  const koreaNow = getKoreaNow();
  const nowMinutes = koreaNow.getUTCHours() * 60 + koreaNow.getUTCMinutes();
  const workEndMinutes = parseTimeToMinutes(timeString);

  return (
    nowMinutes > workEndMinutes ||
    (nowMinutes === workEndMinutes &&
      (koreaNow.getUTCSeconds() > 0 ||
        koreaNow.getUTCMilliseconds() > 0))
  );
};

const defaultRentalStartDate = (settings = {}) => {
  const shouldAdjustAfterWorkEnd =
    settings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END;

  if (!shouldAdjustAfterWorkEnd) {
    return today();
  }

  return isKoreaNowAfterTime(settings.workEndTime || DEFAULT_WORK_END_TIME)
    ? addDaysFrom(today(), 1)
    : today();
};

const createDefaultRequestForm = (settings = {}) => {
  const maxRentalDays = settings.maxRentalDays ?? DEFAULT_MAX_RENTAL_DAYS;
  const startDate = defaultRentalStartDate(settings);

  return {
    team: '',
    borrower: '',
    startDate,
    dueDate: addDaysFrom(startDate, maxRentalDays),
    purpose: '',
  };
};

// --- 초기 자산 데이터 생성 ---
function seedLaptops() {
  return Array.from({ length: 15 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    const makers = ['LG Gram 16 Pro', 'Samsung Galaxy Book 4', 'Dell Latitude 5540', 'Lenovo ThinkPad L14', 'HP EliteBook 840'];
    const maker = makers[i % makers.length];
    return {
      id: `NB-${n}`,
      category: '노트북',
      assetNo: `LAPTOP-${new Date().getFullYear()}-${n}`,
      serialNo: `SN-${new Date().getFullYear()}-${10000 + i * 37}`,
      model: maker,
      manufactureDate: `${2022 + (i % 4)}-${String((i % 12) + 1).padStart(2, '0')}-15`,
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: i % 7 === 0 ? '배터리 상태 확인 필요' : i % 5 === 0 ? 'HDMI 젠더 파우치 수납' : '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    };
  });
}

const initialData = {
  laptops: seedLaptops(),
  requests: [],
  assetCategories: ['노트북'],
  teams: ['매일경제아카데미', '채용대행팀', '문항개발팀', '경제교육팀'],
  borrowers: [],
  settings: {
    teamInputMode: 'dropdown',
    borrowerInputMode: 'dropdown',
    maxRentalDays: DEFAULT_MAX_RENTAL_DAYS,
    adjustStartDateAfterWorkEnd: DEFAULT_ADJUST_START_DATE_AFTER_WORK_END,
    workEndTime: DEFAULT_WORK_END_TIME,
    requireAdminApproval: true,
  },
};

function normalizeBorrowers(borrowers, teams) {
  return borrowers.map((borrower, index) => {
    if (typeof borrower === 'string') {
      return { name: borrower, team: teams[index % teams.length] || '' };
    }
    return { name: borrower.name || '', team: borrower.team || teams[0] || '' };
  });
}

function mergePersistedData(rawData) {
  const parsed = { ...initialData, ...(rawData || {}) };
  const assetCategories = Array.isArray(parsed.assetCategories) && parsed.assetCategories.length > 0
    ? parsed.assetCategories
    : initialData.assetCategories;

  const settings = {
    ...initialData.settings,
    ...(parsed.settings || {}),
  };

  return {
    ...parsed,
    assetCategories,
    settings,
    laptops: (parsed.laptops || []).map((asset) => ({
      ...asset,
      category: asset.category || assetCategories[0] || '노트북',
    })),
    borrowers: normalizeBorrowers(parsed.borrowers || [], parsed.teams || []),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem('laptopRentalDashboard.v2');
    if (!raw) return initialData;
    return mergePersistedData(JSON.parse(raw));
  } catch {
    return initialData;
  }
}

// --- 공통 고품질 UI 컴포넌트 내장 정의 (카드, 버튼 등) ---
function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardContent({ children, className = '' }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}

function Badge({ children }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${statusStyle[children] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
      {children}
    </span>
  );
}

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
        <div className={`rounded-2xl p-3 border ${toneMap[tone].split(' ')[0]} ${toneMap[tone].split(' ')[2]}`}>
          <Icon className={toneMap[tone].split(' ')[1]} size={22} />
        </div>
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
    primary: "mk-btn-primary",
    secondary: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950",
    danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
    dangerOutline: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder = '', ...props }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus"
        {...props}
      />
    </label>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition mk-form-focus appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2364748B%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:0.7em_auto] bg-[right_1rem_center] bg-no-repeat"
      >
        {children}
      </select>
    </label>
  );
}

function App() {
  const [data, setData] = useState(loadData);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const applyingRemoteRef = useRef(false);
  const lastSyncedDataRef = useRef('');
  const saveTimerRef = useRef(null);
  const allowFirebaseWriteRef = useRef(false);
  const [view, setView] = useState('user'); // 'user' | 'admin'
  const [query, setQuery] = useState('');
  const [selectedAssetCategory, setSelectedAssetCategory] = useState('전체');
  const [availabilityFilter, setAvailabilityFilter] = useState(STATUS.AVAILABLE);
  const [selectedLaptopId, setSelectedLaptopId] = useState(null);
  const [form, setForm] = useState(() => createDefaultRequestForm(data.settings));
  const [adminTab, setAdminTab] = useState('dashboard'); // 'dashboard' | 'requests' | 'laptops' | 'categories' | 'people' | 'settings'
  const [editLaptop, setEditLaptop] = useState(null);
  const [newLaptop, setNewLaptop] = useState(null); // 신규 자산 생성을 위한 상태 값 추가
  const [newAssetCategory, setNewAssetCategory] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [newBorrower, setNewBorrower] = useState('');
  const [newBorrowerTeam, setNewBorrowerTeam] = useState('');

  // 엑셀/CSV 업로드 패널 토글 상태 값 추가
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [assetGridColumns, setAssetGridColumns] = useState(1);

  // 설정 임시 저장을 위한 임시 상태 정의
  const [tempSettings, setTempSettings] = useState(data.settings);

  // Toast 메시지 상태
  const [toast, setToast] = useState(null);
  // 커스텀 모달 확인창 상태
  const [confirmModal, setConfirmModal] = useState(null);

  // 엑셀/CSV 파싱에 사용되는 라이브러리(SheetJS) 동적 주입 처리
  useEffect(() => {
    if (!window.XLSX) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    const updateAssetGridColumns = () => {
      if (window.matchMedia('(min-width: 1280px)').matches) {
        setAssetGridColumns(3);
      } else if (window.matchMedia('(min-width: 640px)').matches) {
        setAssetGridColumns(2);
      } else {
        setAssetGridColumns(1);
      }
    };

    updateAssetGridColumns();
    window.addEventListener('resize', updateAssetGridColumns);

    return () => {
      window.removeEventListener('resize', updateAssetGridColumns);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      DATA_DOC_REF,
      async (snapshot) => {
        try {
          if (!snapshot.exists()) {
            allowFirebaseWriteRef.current = false;
            setFirebaseReady(true);
            setToast({
              message: 'Firebase 원격 데이터 문서가 없습니다. 새 브라우저의 기본 데이터로 자동 초기화하지 않도록 저장을 차단했습니다. Firestore의 laptopRentalDashboard/main 문서를 확인해 주세요.',
              type: 'error'
            });
            return;
          }

          const remotePayload = snapshot.data();
          const remoteData = mergePersistedData(remotePayload.data || remotePayload);
          const remoteJson = JSON.stringify(remoteData);

          allowFirebaseWriteRef.current = true;

          if (remoteJson === lastSyncedDataRef.current) {
            setFirebaseReady(true);
            return;
          }

          lastSyncedDataRef.current = remoteJson;
          applyingRemoteRef.current = true;
          localStorage.setItem('laptopRentalDashboard.v2', remoteJson);
          setData(remoteData);
          setFirebaseReady(true);
        } catch (error) {
          console.error('Firebase snapshot handling error:', error);
          allowFirebaseWriteRef.current = false;
          setFirebaseReady(true);
          setToast({
            message: 'Firebase 데이터 동기화 처리 중 오류가 발생했습니다. 원격 DB 보호를 위해 저장을 차단했습니다. 콘솔과 Firestore 규칙을 확인해 주세요.',
            type: 'error'
          });
        }
      },
      (error) => {
        console.error('Firebase sync error:', error);
        allowFirebaseWriteRef.current = false;
        setFirebaseReady(true);
        setToast({
          message: 'Firebase 연결 또는 권한 오류가 발생했습니다. 원격 DB 보호를 위해 저장을 차단했습니다. Firestore Database 생성 여부와 보안 규칙을 확인해 주세요.',
          type: 'error'
        });
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const dataJson = JSON.stringify(data);
    localStorage.setItem('laptopRentalDashboard.v2', dataJson);

    if (!firebaseReady || !allowFirebaseWriteRef.current) return;

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    if (dataJson === lastSyncedDataRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      lastSyncedDataRef.current = dataJson;

      setDoc(DATA_DOC_REF, { data, updatedAt: serverTimestamp() }).catch((error) => {
        lastSyncedDataRef.current = '';
        console.error('Firebase save error:', error);
        setToast({ message: 'Firebase 저장에 실패했습니다. Firestore 보안 규칙과 네트워크 상태를 확인해 주세요.', type: 'error' });
      });
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [data, firebaseReady]);

  // 첫 마운트 시 새 대여자 추가용 팀 초기화
  useEffect(() => {
    if (data.teams.length > 0 && !newBorrowerTeam) {
      setNewBorrowerTeam(data.teams[0]);
    }
  }, [data.teams]);

  // 설정 탭으로 변경되거나 시스템 원본 설정 값이 변경될 때 임시 설정 버퍼를 동기화
  useEffect(() => {
    if (adminTab === 'settings') {
      setTempSettings(data.settings);
    }
  }, [adminTab, data.settings]);

  const triggerToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const triggerConfirm = (title, message, onConfirm) => {
    setConfirmModal({ title, message, onConfirm });
  };

  const blockedLaptopIds = useMemo(() => {
    return new Set(
      data.requests
        .filter((r) => ['신청중', '대여중', '보류'].includes(r.status))
        .map((r) => r.laptopId)
    );
  }, [data.requests]);

  const stats = useMemo(() => ({
    total: data.laptops.length,
    available: data.laptops.filter((l) => !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE).length,
    requested: data.requests.filter((r) => r.status === STATUS.REQUESTED).length,
    approved: data.requests.filter((r) => r.status === STATUS.APPROVED).length,
    overdue: data.requests.filter((r) => r.status === STATUS.APPROVED && r.dueDate < today()).length,
  }), [data, blockedLaptopIds]);

  const filteredLaptops = data.laptops.filter((l) => {
    const keywordMatched = `${l.category || ''} ${l.assetNo} ${l.serialNo} ${l.model} ${l.note}`
      .toLowerCase()
      .includes(query.toLowerCase());

    const categoryMatched =
      selectedAssetCategory === '전체' || l.category === selectedAssetCategory;

    const availabilityMatched =
      availabilityFilter === '전체'
        ? true
        : availabilityFilter === STATUS.AVAILABLE
          ? !blockedLaptopIds.has(l.id) && l.status !== STATUS.UNAVAILABLE
          : blockedLaptopIds.has(l.id) || l.status === STATUS.UNAVAILABLE;

    return keywordMatched && categoryMatched && availabilityMatched;
  });

  const selectedLaptop = data.laptops.find((l) => l.id === selectedLaptopId);
  const filteredBorrowers = data.borrowers.filter((b) => b.team === form.team);

  const currentWorkEndTime = data.settings?.workEndTime || DEFAULT_WORK_END_TIME;
  const isRentalStartAdjustedAfterWorkEnd =
    (data.settings?.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END) &&
    isKoreaNowAfterTime(currentWorkEndTime);

  const editLaptopIndex = editLaptop ? data.laptops.findIndex((l) => l.id === editLaptop.id) : -1;
  const editLaptopInsertIndex =
    editLaptopIndex >= 0
      ? Math.min(
          Math.ceil((editLaptopIndex + 1) / assetGridColumns) * assetGridColumns - 1,
          data.laptops.length - 1
        )
      : -1;

  const submitRequest = () => {
    if (!selectedLaptop || blockedLaptopIds.has(selectedLaptop.id)) {
      triggerToast('이미 예약 중이거나 이용 불가한 기기입니다.', 'error');
      return;
    }
    if (!form.team || !form.borrower || !form.startDate || !form.dueDate) {
      triggerToast('팀명, 대여자명, 대여 예정일을 모두 작성해 주세요.', 'error');
      return;
    }

    if (form.startDate < today()) {
      triggerToast('대여 시작일은 오늘 날짜 이전으로 선택할 수 없습니다.', 'error');
      return;
    }

    if (form.dueDate < form.startDate) {
      triggerToast('반납 예정일은 대여 시작일 이후여야 합니다.', 'error');
      return;
    }

    // 시스템 최장 허용 대여 기한 검증 로직 가동
    const maxAllowedDate = addDaysFrom(form.startDate, data.settings.maxRentalDays);
    if (form.dueDate > maxAllowedDate) {
      triggerToast(`기본 최장 허용 대여 기한(${data.settings.maxRentalDays}일)을 초과할 수 없습니다. 최대 허용 반납일: ${maxAllowedDate}`, 'error');
      return;
    }

    const requestId = `REQ-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      laptops: prev.laptops.map((l) =>
        l.id === selectedLaptop.id ? { ...l, status: STATUS.REQUESTED, currentRequestId: requestId } : l
      ),
      requests: [
        {
          id: requestId,
          laptopId: selectedLaptop.id,
          assetCategory: selectedLaptop.category || '노트북',
          assetNo: selectedLaptop.assetNo,
          team: form.team,
          borrower: form.borrower,
          startDate: form.startDate,
          dueDate: form.dueDate,
          purpose: form.purpose,
          status: STATUS.REQUESTED,
          adminMemo: '',
          requestedAt: new Date().toLocaleString('ko-KR'),
        },
        ...prev.requests,
      ],
    }));

    setSelectedLaptopId(null);
    setForm(createDefaultRequestForm(data.settings));
    triggerToast('대여 신청이 성공적으로 접수되었습니다. 관리자 승인을 대기합니다.', 'success');
  };

  const updateRequest = (id, status) => {
    setData((prev) => {
      const req = prev.requests.find((r) => r.id === id);
      if (!req) return prev;
      return {
        ...prev,
        requests: prev.requests.map((r) => (r.id === id ? { ...r, status } : r)),
        laptops: prev.laptops.map((l) =>
          l.id === req.laptopId
            ? {
                ...l,
                status: status === STATUS.DENIED || status === STATUS.RETURNED ? STATUS.AVAILABLE : status,
                currentRequestId: status === STATUS.DENIED || status === STATUS.RETURNED ? null : id,
              }
            : l
        ),
      };
    });
    triggerToast(`상태가 [${status}]로 업데이트 되었습니다.`, 'success');
  };

  const updateRequestMemo = (id, memo) => {
    setData((prev) => ({
      ...prev,
      requests: prev.requests.map((r) => (r.id === id ? { ...r, adminMemo: memo } : r)),
    }));
  };

  // 신규 노트북 자산 생성 제어 로직
  const handleAddLaptopClick = () => {
    setShowUploadPanel(false);
    setEditLaptop(null);

    if (newLaptop) {
      setNewLaptop(null);
      return;
    }

    setNewLaptop({
      category: data.assetCategories?.[0] || '노트북',
      assetNo: '',
      serialNo: '',
      model: '',
      manufactureDate: today(),
      photo: `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`,
      note: '',
      status: STATUS.AVAILABLE,
      currentRequestId: null,
    });
  };
  
  const createLaptop = () => {
    if (!newLaptop.assetNo.trim()) {
      triggerToast('자산 관리 번호를 정확히 입력해 주세요.', 'error');
      return;
    }
    const newId = `NB-${Date.now()}`;
    setData((prev) => ({
      ...prev,
      laptops: [
        ...prev.laptops,
        {
          ...newLaptop,
          id: newId,
          category: newLaptop.category || prev.assetCategories?.[0] || '노트북',
        },
      ],
    }));
    setNewLaptop(null);
    triggerToast(`자산 ${newLaptop.assetNo}이(가) 신규 등록되었습니다.`, 'success');
  };

  // 엑셀/CSV 파일 일괄 자동 업로드 분석 처리 로직
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCsvFile = fileName.endsWith('.csv');

    if (!isExcelFile && !isCsvFile) {
      triggerToast('엑셀(.xlsx, .xls) 또는 CSV(.csv) 파일만 업로드할 수 있습니다.', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const dataBytes = new Uint8Array(evt.target.result);
        let jsonResult = [];

        if (isExcelFile) {
          if (!window.XLSX) {
            triggerToast('엑셀 처리 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.', 'error');
            e.target.value = '';
            return;
          }

          const workbook = window.XLSX.read(dataBytes, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          jsonResult = window.XLSX.utils.sheet_to_json(sheet);
        }

        if (isCsvFile) {
          const decoder = new TextDecoder('utf-8');
          const csvText = decoder.decode(dataBytes);

          if (window.XLSX) {
            const workbook = window.XLSX.read(csvText, { type: 'string' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            jsonResult = window.XLSX.utils.sheet_to_json(sheet);
          } else {
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
        }

        processParsedData(jsonResult);
        // 파일 인풋 버퍼 초기화로 동일 파일 재업로드 대응
        e.target.value = '';
      } catch (err) {
        triggerToast('파일 파싱 중 에러가 발생했습니다. 규격을 확인해 주세요.', 'error');
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 분석 완료된 자산 데이터 병합 가동
  const processParsedData = (jsonList) => {
    if (!jsonList || jsonList.length === 0) {
      triggerToast('업로드된 파일에서 읽어올 수 있는 자산이 감지되지 않았습니다.', 'error');
      return;
    }

    const uploadedLaptops = [];
    let addCount = 0;
    let missingAssetNoCount = 0;
    let invalidCategoryCount = 0;
    const invalidCategoryNames = new Set();

    jsonList.forEach((row, index) => {
      // 실무자 유연한 대소문자 및 유사어 추적 필터
      const matchVal = (keys) => {
        const matchedKey = Object.keys(row).find(k =>
          keys.some(key => k.toLowerCase().replace(/\s+/g, '').includes(key.toLowerCase()))
        );
        return matchedKey ? String(row[matchedKey]).trim() : '';
      };

      const category = matchVal(['자산카테고리', '카테고리', '분류', 'category', 'assetcategory', 'asset_category']);
      const assetNo = matchVal(['자산관리번호', '관리번호', '자산번호', 'assetno', 'asset_no']);
      const model = matchVal(['모델명', '모델', '기종', 'model']);
      const serialNo = matchVal(['시리얼번호', '시리얼', 'serialno', 'serial_no', 'sn', 's/n']);
      const manufactureDate = matchVal(['제조일자', '제조일', '구입일자', '구입일', 'manufacturedate', 'manufacture_date']);
      const note = matchVal(['비고', '메모', '특이사항', 'note']);
      const photo = matchVal(['사진url', '사진링크', '사진', 'photo', 'image']);
      const statusVal = matchVal(['대여가능여부', '대여가능', '대여상태', '상태', 'status']);

      // 필수 충족요건인 '자산관리번호' 존재 체크
      if (!assetNo) {
        missingAssetNoCount++;
        return;
      }

      // 등록된 자산 카테고리와 일치하는 행만 업로드
      const matchedCategory = (data.assetCategories || []).find(
        (registeredCategory) =>
          String(registeredCategory || '').trim().toLowerCase() === category.trim().toLowerCase()
      );

      if (!category || !matchedCategory) {
        invalidCategoryCount++;
        invalidCategoryNames.add(category || '미입력');
        return;
      }

      const fallbackPhoto = `https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=500&q=80`;
      let finalStatus = STATUS.AVAILABLE;
      
      if (statusVal.includes('대여불가') || statusVal.toLowerCase().includes('unavailable') || statusVal.includes('불가')) {
        finalStatus = STATUS.UNAVAILABLE;
      }

      uploadedLaptops.push({
        id: `NB-UP-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        category: matchedCategory,
        assetNo: assetNo,
        serialNo: serialNo || `SN-AUTO-${Math.floor(Math.random() * 90000 + 10000)}`,
        model: model || '미지정 기종',
        manufactureDate: manufactureDate || today(),
        photo: photo || fallbackPhoto,
        note: note || '',
        status: finalStatus,
        currentRequestId: null
      });
      addCount++;
    });

    if (uploadedLaptops.length > 0) {
      setData((prev) => ({
        ...prev,
        laptops: [...prev.laptops, ...uploadedLaptops],
      }));
      setShowUploadPanel(false);

      const skippedMessages = [];
      if (invalidCategoryCount > 0) {
        skippedMessages.push(`카테고리 불일치 ${invalidCategoryCount}건 제외`);
      }
      if (missingAssetNoCount > 0) {
        skippedMessages.push(`자산관리번호 누락 ${missingAssetNoCount}건 제외`);
      }

      triggerToast(
        `총 ${addCount}대의 기기를 엑셀/CSV 데이터베이스로 일괄 추가 등록했습니다.${skippedMessages.length ? ` (${skippedMessages.join(', ')})` : ''}`,
        'success'
      );
    } else {
      const invalidCategoryList = Array.from(invalidCategoryNames).slice(0, 5).join(', ');

      if (invalidCategoryCount > 0) {
        triggerToast(
          `등록된 자산 카테고리와 일치하는 행이 없어 업로드하지 않았습니다. 불일치 카테고리: ${invalidCategoryList}`,
          'error'
        );
        return;
      }

      if (missingAssetNoCount > 0) {
        triggerToast('자산관리번호가 입력된 행이 없어 업로드하지 않았습니다.', 'error');
        return;
      }

      triggerToast('헤더(자산카테고리, 자산관리번호, 모델명, 시리얼번호 등) 규격 정보가 일치하지 않아 가져오지 못했습니다.', 'error');
    }
  };

  // 자산 영구 삭제 제어 로직
  const deleteLaptop = (id, assetNo) => {
    triggerConfirm(
      '자산 삭제',
      `정말로 자산 [${assetNo}] 기기를 시스템 목록에서 영구적으로 삭제하시겠습니까? 신청 원장은 보존되나 기기 목록에서는 삭제됩니다.`,
      () => {
        setData((prev) => ({
          ...prev,
          laptops: prev.laptops.filter((l) => l.id !== id),
        }));
        if (selectedLaptopId === id) setSelectedLaptopId(null);
        triggerToast(`자산 ${assetNo}이(가) 성공적으로 삭제되었습니다.`, 'success');
      }
    );
  };

  const saveLaptop = () => {
    setData((prev) => ({
      ...prev,
      laptops: prev.laptops.map((l) => (l.id === editLaptop.id ? editLaptop : l)),
    }));
    setEditLaptop(null);
    triggerToast('자산 상세 정보가 성공적으로 반영되었습니다.', 'success');
  };

  const resetDemo = () => {
    triggerConfirm(
      '로컬 캐시 초기화',
      '현재 브라우저의 로컬 캐시만 삭제합니다. Firebase 원격 DB는 초기화하지 않습니다. 새로고침 후 원격 데이터를 다시 불러옵니다. 계속하시겠습니까?',
      () => {
        localStorage.removeItem('laptopRentalDashboard.v2');
        triggerToast('로컬 캐시가 초기화되었습니다. 원격 데이터를 다시 불러오기 위해 새로고침합니다.', 'success');
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* --- 상단 글로벌 네비게이션 --- */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-2xl mk-brand-gradient-tr p-2 text-white mk-brand-shadow-md">
              <Laptop size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="break-keep text-base font-bold leading-snug tracking-tight text-slate-900 sm:text-lg">
                매일경제아카데미 기기 대여 시스템
              </h1>
              <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                https://notebook.recruit.kro.kr
              </p>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-1.5 rounded-xl border border-slate-200/60 bg-slate-100 p-1 sm:w-auto sm:min-w-[176px]">
            <button
              onClick={() => setView('user')}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition sm:py-1.5 ${
                view === 'user'
                  ? 'bg-white mk-brand-text shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              사용자 화면
            </button>
            <button
              onClick={() => setView('admin')}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition sm:py-1.5 ${
                view === 'admin'
                  ? 'bg-white mk-brand-text shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              관리자 모드
            </button>
          </div>
        </div>
      </header>

      {/* --- 메인 워크스페이스 --- */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        
        {/* --- 실시간 주요 대여 현황 보드 --- */}
        <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard icon={Laptop} label="보유 자산" value={stats.total} />
          <StatCard icon={CheckCircle2} label="대여 즉시 가능" value={stats.available} tone="green" />
          <StatCard icon={Clock} label="승인 대기중" value={stats.requested} tone="amber" />
          <StatCard icon={ShieldCheck} label="대여 사용중" value={stats.approved} tone="blue" />
          <StatCard icon={XCircle} label="반납 지연중" value={stats.overdue} tone="rose" />
        </section>

        {view === 'user' ? (
          /* ==================== [사용자 대여 화면] ==================== */
          /* lg:items-start를 적용하여 내부 카드들의 높이가 세로로 길게 늘어지지 않게 만듭니다. */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start">
            
            {/* 좌측 자산 카드 셀렉터 (2컬럼 폭 차지) */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="shrink-0">
                      <h2 className="text-lg font-bold text-slate-900">대여 기기 선택</h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        [대여가능] 상태의 기기만 신청할 수 있습니다.
                      </p>
                    </div>
                    <div className="grid w-full gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)] lg:w-auto lg:grid-cols-[118px_118px_15rem]">
                      <select
                        aria-label="자산 카테고리 필터"
                        value={selectedAssetCategory}
                        onChange={(e) => {
                          setSelectedAssetCategory(e.target.value);
                          setSelectedLaptopId(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                      >
                        <option value="전체">전체</option>
                        {(data.assetCategories || []).map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>

                      <select
                        aria-label="대여 가능여부 필터"
                        value={availabilityFilter}
                        onChange={(e) => {
                          setAvailabilityFilter(e.target.value);
                          setSelectedLaptopId(null);
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none transition mk-form-focus"
                      >
                        <option value="전체">전체</option>
                        <option value={STATUS.AVAILABLE}>대여가능</option>
                        <option value={STATUS.UNAVAILABLE}>대여불가</option>
                      </select>

                      <div className="relative w-full">
                        <Search className="absolute left-3 top-3 text-slate-400" size={16} />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="자산관리번호, 기종, 키워드 검색"
                          className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-xs outline-none transition mk-form-focus"
                        />
                      </div>
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
                          className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${
                            isSelected
                              ? 'border-blue-500 ring-4 ring-blue-50 bg-blue-50/10'
                              : 'border-slate-200 bg-white hover:shadow-md'
                          } ${blocked ? 'cursor-not-allowed opacity-60 bg-slate-50/50' : 'cursor-pointer'}`}
                        >
                          <div className="p-1 pt-[10px]">
                            <div className="relative h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                              <img
                                src={l.photo}
                                alt={l.assetNo}
                                className="h-full w-full object-cover transition duration-350 group-hover:scale-105"
                              />
                              {blocked && (
                                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] flex items-center justify-center text-white text-xs font-bold gap-1">
                                  <LockIcon size={14} /> 이용 불가
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2 p-4 pt-3">
                            <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {l.category || '노트북'}
                            </div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-bold text-slate-900 tracking-tight">{l.assetNo}</span>
                              <Badge>{blocked ? (l.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : l.status) : STATUS.AVAILABLE}</Badge>
                            </div>
                            <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                            <div className="space-y-0.5 text-[11px] text-slate-500">
                              <div>S/N: {l.serialNo}</div>
                              <div>출고일: {l.manufactureDate}</div>
                            </div>
                            <div className="mt-1 rounded-lg bg-slate-100 p-2 text-[11px] text-slate-600 border border-slate-200/50">
                              💡 {l.note || '특이사항 없음'}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 우측 대여 신청 패널 (1컬럼 폭 차지)
                sticky & top-24 속성을 명시하여 스크롤할 때 우측 가이드 폼이 화면에 우아하게 안착 고정됩니다. */}
            <div className="lg:col-span-1 lg:sticky lg:top-24 h-fit">
              <Card className="mk-brand-border-soft shadow-md shadow-slate-100">
                <div
                  className="px-6 py-4 text-white"
                  style={{ background: 'linear-gradient(90deg, var(--mk-orange-dark), var(--mk-orange))' }}
                >
                  <h2 className="text-lg font-bold text-white">기기 대여 신청</h2>
                  <p className="mt-0.5 text-xs text-orange-100">
                    대여가능일은 최대 {data.settings.maxRentalDays ?? '0'}일입니다.
                  </p>
                  {isRentalStartAdjustedAfterWorkEnd && (
                    <p className="mt-0.5 text-xs text-orange-100">
                      업무시간({currentWorkEndTime}) 종료로 대여 시작일은 다음 날로 조정되었습니다.
                    </p>
                  )}
                </div>
                <CardContent className="space-y-4 p-6">
                  <div>
                    <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                      대여 기기
                    </div>

                    <div className={`rounded-xl px-4 py-3 border text-xs transition-colors duration-150 ${
                      selectedLaptop 
                        ? 'bg-blue-50 border-blue-200 text-blue-800' 
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      {selectedLaptop ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                              {selectedLaptop.category || '노트북'}
                            </span>
                            <b className="text-sm ml-1">{selectedLaptop.assetNo}</b>
                          </div>
                          <button onClick={() => setSelectedLaptopId(null)} className="shrink-0 text-blue-500 hover:text-blue-800 font-bold">
                            변경
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Info size={14} className="text-slate-400" />
                          <span>기기 선택 섹션에서 대여할 기기를 먼저 선택해 주세요.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {data.settings.teamInputMode === 'dropdown' ? (
                    <Select
                      label="부서 / 팀 선택"
                      value={form.team}
                      onChange={(v) => setForm({ ...form, team: v, borrower: '' })}
                    >
                      <option value="">팀 선택</option>
                      {data.teams.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="부서 / 팀 직접 입력"
                      value={form.team}
                      onChange={(v) => setForm({ ...form, team: v })}
                      placeholder="팀명을 직접 입력하세요"
                    />
                  )}

                  {data.settings.borrowerInputMode === 'dropdown' ? (
                    <Select
                      label="대여자명"
                      value={form.borrower}
                      onChange={(v) => setForm({ ...form, borrower: v })}
                    >
                      <option value="">{form.team ? '대여자 선택' : '소속 부서를 먼저 선택해 주세요'}</option>
                      {filteredBorrowers.map((b, index) => (
                        <option key={`${b.team}-${b.name}-${index}`} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      label="신청 대여자 직접 입력"
                      value={form.borrower}
                      onChange={(v) => setForm({ ...form, borrower: v })}
                      placeholder="성명을 입력하세요"
                    />
                  )}

                  {/* 최장 허용 대여 기한에 맞추어 캘린더 min, max 속성을 실시간 바인딩 처리합니다 */}
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="대여 시작일"
                      type="date"
                      value={form.startDate}
                      min={today()}
                      onChange={(v) => {
                        const nextStartDate = v < today() ? today() : v;

                        setForm({
                          ...form,
                          startDate: nextStartDate,
                          dueDate: addDaysFrom(nextStartDate, data.settings.maxRentalDays),
                        });
                      }}
                    />
                    <Input
                      label="반납 예정일"
                      type="date"
                      value={form.dueDate}
                      min={form.startDate}
                      max={addDaysFrom(form.startDate, data.settings.maxRentalDays)}
                      onChange={(v) => {
                        const minDueDate = form.startDate;
                        const maxDueDate = addDaysFrom(form.startDate, data.settings.maxRentalDays);
                        let nextDueDate = v;

                        if (nextDueDate < minDueDate) {
                          nextDueDate = minDueDate;
                        }

                        if (nextDueDate > maxDueDate) {
                          nextDueDate = maxDueDate;
                        }

                        setForm({ ...form, dueDate: nextDueDate });
                      }}
                    />
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">대여 목적</span>
                    <textarea
                      value={form.purpose}
                      onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                      className="h-20 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none mk-form-ring-focus"
                      placeholder="출장용, 회의용, 교육 연수 등"
                    />
                  </label>

                  <Button
                    onClick={submitRequest}
                    disabled={!selectedLaptop}
                    className="w-full justify-center rounded-xl py-6"
                  >
                    기기 대여 신청
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          /* ==================== [관리자 설정 화면] ==================== */
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[260px_1fr]">
            
            {/* 좌측 사이드 네비게이션 메뉴 */}
            <div className="lg:sticky lg:top-24 h-fit">
              <Card>
                <div className="bg-slate-900 px-5 py-4 text-white">
                  <h3 className="text-xs font-bold tracking-wider uppercase text-slate-400">관리 메뉴</h3>
                </div>
                <CardContent className="space-y-1.5 p-3">
                  {[
                    ['dashboard', LayoutDashboard, '실시간 대시보드'],
                    ['requests', ClipboardList, '신청·대여 목록'],
                    ['laptops', Laptop, '대여 자산 목록'],
                    ['categories', ClipboardList, '자산 카테고리 등록'],
                    ['people', Users, '부서·사용자 등록'],
                    ['settings', Settings, '시스템 설정'],
                  ].map(([key, Icon, label]) => (
                    <Button
                      key={key}
                      variant={adminTab === key ? 'primary' : 'ghost'}
                      onClick={() => setAdminTab(key)}
                      className={`w-full justify-start ${adminTab === key ? '' : 'hover:bg-slate-100 text-slate-700'}`}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </Button>
                  ))}
                  <div className="pt-4 mt-2 border-t border-slate-100">
                    <Button
                      variant="dangerOutline"
                      onClick={resetDemo}
                      className="w-full justify-start"
                    >
                      <RotateCcw size={16} />
                      <span>로컬 캐시 초기화</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 우측 세부 탭 컨텐츠 영역 */}
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  
                  {/* 대시보드 탭 */}
                  {adminTab === 'dashboard' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">관리자 대시보드 및 지침</h2>
                        <p className="text-xs text-slate-500 mt-1">
                          본 서비스는 브라우저의 가상 DB(Local Storage)를 기본 제공하여 브라우저 리로드 이후에도 내역이 휘발되지 않도록 구축되어 있습니다.
                        </p>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">주요 프로세스 매칭 규정</h4>
                          <ul className="mt-3 space-y-2 text-xs text-slate-600 list-disc pl-4">
                            <li>사용자의 원클릭 신청이 완료되는 즉시, 타 사원의 추가 신청 접수가 제한됩니다.</li>
                            <li>승인, 대기, 보류, 불허, 반납완료 등 총 5단계의 승인 상태 전환 로직이 유기적으로 가동됩니다.</li>
                            <li>불허 혹은 최종 반납완료 처리가 가해지는 순간, 자산은 즉각 &apos;대여가능&apos; 상태로 마킹 복귀됩니다.</li>
                          </ul>
                        </div>
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5 text-blue-800">
                          <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">외부 서버 통합 시 권장 개발 기술</h4>
                          <p className="mt-3 text-xs leading-relaxed text-blue-700">
                            상용 통합 배포 시, 본 프로토타입의 데이터 구조를 활용하여 Firebase Firestore, Postgres DB 등을 바인딩하고 알림톡/메일 API 서비스와 연계하여 통합 사내망 알림을 설계할 수 있습니다.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 신청 관리 원장 탭 */}
                  {adminTab === 'requests' && (
                    <div className="space-y-4">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">신청·대여 목록</h2>
                        <p className="text-xs text-slate-500 mt-1">부서원들이 제출한 실시간 신청서에 대한 승인/대기/반납 전환 관리 창구입니다.</p>
                      </div>
                      <div className="space-y-4">
                        {data.requests.length === 0 ? (
                          <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-12 text-center text-slate-400 text-xs">
                            현재 접수되거나 처리된 대여 원장 이력이 전무합니다.
                          </div>
                        ) : (
                          data.requests.map((r) => {
                            const isOverdue = r.status === STATUS.APPROVED && r.dueDate < today();
                            return (
                              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                  <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-bold text-slate-950 text-sm">{r.assetNo}</span>
                                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                        {r.assetCategory || '노트북'}
                                      </span>
                                      <Badge>{r.status}</Badge>
                                      {isOverdue && (
                                        <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10 animate-pulse">
                                          반납 기한 지연중
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-600 font-medium">
                                      소속: <span className="text-slate-900">{r.team}</span> &middot; 대여자명: <span className="text-slate-900">{r.borrower}</span>
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      대여 일정: {r.startDate} ~ {r.dueDate}
                                    </div>
                                    <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                                      목적: <span className="text-slate-700 font-medium">{r.purpose || '서술 목적 없음'}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                      등록 접수 일시: {r.requestedAt}
                                    </div>
                                  </div>

                                  {/* 상태 전환 버튼 피드 */}
                                  <div className="flex flex-wrap gap-1">
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.APPROVED)}
                                      variant="primary"
                                      className="px-2.5 py-1.5 text-xs rounded-lg"
                                    >
                                      승인
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.REQUESTED)}
                                      variant="outline"
                                      className="px-2.5 py-1.5 text-xs rounded-lg"
                                    >
                                      대기
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.ON_HOLD)}
                                      variant="secondary"
                                      className="px-2.5 py-1.5 text-xs rounded-lg text-purple-700 bg-purple-50 hover:bg-purple-100"
                                    >
                                      보류
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.DENIED)}
                                      variant="dangerOutline"
                                      className="px-2.5 py-1.5 text-xs rounded-lg"
                                    >
                                      불허
                                    </Button>
                                    <Button
                                      onClick={() => updateRequest(r.id, STATUS.RETURNED)}
                                      variant="outline"
                                      className="px-2.5 py-1.5 text-xs rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
                                    >
                                      반납확정
                                    </Button>
                                  </div>
                                </div>
                                
                                <div className="pt-2 border-t border-slate-100">
                                  <label className="block">
                                    <span className="block text-[10px] font-semibold text-slate-500 uppercase">승인 관리자 심사 및 인수인계 코멘트</span>
                                    <input
                                      type="text"
                                      value={r.adminMemo}
                                      onChange={(e) => updateRequestMemo(r.id, e.target.value)}
                                      placeholder="전달 혹은 상태 변경 사유 등을 남겨 공유하세요."
                                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                                    />
                                  </label>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* 자산 목록 관리 탭 */}
                  {adminTab === 'laptops' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                          <h2 className="text-lg font-bold text-slate-900">대여 자산 목록</h2>
                          <p className="text-xs text-slate-500 mt-1">자산 고유 시리얼 넘버, 기기 사진 연동, 특이 사항 메모 및 장비를 관리합니다.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {/* 엑셀/CSV 업로드 패널 토글 액션 버튼 추가 */}
                          <Button
                            onClick={() => {
                              setShowUploadPanel((prev) => !prev);
                              setNewLaptop(null);
                              setEditLaptop(null);
                            }}
                            variant="outline"
                            className="py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-sm"
                          >
                            <ClipboardList size={16} /> 엑셀/CSV 업로드
                          </Button>
                          <Button
                            onClick={handleAddLaptopClick}
                            variant="primary"
                            className="py-2.5 px-4 rounded-xl text-xs sm:text-sm shadow-md"
                          >
                            <Plus size={16} /> 신규 자산 추가
                          </Button>
                        </div>
                      </div>

                      {/* 자동 일괄 업로드 가이드 및 파일 셀렉터 드롭존 UI */}
                      {showUploadPanel && (
                        <div className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-400 bg-slate-50/50 p-6 text-center transition-colors duration-150 animate-fadeIn">
                          <div className="mx-auto flex max-w-xl flex-col items-center justify-center">
                            <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 mb-3 border border-blue-100">
                              <ClipboardList size={26} />
                            </div>
                            <h4 className="text-sm font-bold text-slate-800">엑셀 / CSV 파일 자동 업로드 일괄 추가</h4>
                            <p className="text-[11px] text-slate-500 mt-1 max-w-lg leading-relaxed">
                              샘플 양식을 기준으로 첫 번째 시트 또는 CSV 첫 줄의 헤더를 유지하고, 다음 행부터 자산 정보를 입력해 업로드해 주세요.
                            </p>
                            <div className="mt-3.5 rounded-lg bg-white px-4 py-3 border border-slate-200 text-left w-full text-[11px] space-y-1.5 text-slate-600 shadow-sm">
                              <div>📌 <b>엑셀은 첫 번째 시트만 읽습니다.</b> 작성가이드 시트는 그대로 두어도 되지만, 첫 번째 시트로 이동시키면 안 됩니다.</div>
                              <div>📌 <b>헤더는 엑셀 1행 또는 CSV 첫 줄에 있어야 합니다.</b> 제목, 안내문, 빈 줄을 헤더 위에 두면 업로드가 정상 인식되지 않을 수 있습니다.</div>
                              <div>📌 <b>자산카테고리와 자산관리번호는 필수입니다.</b> 둘 중 하나라도 비어 있는 행은 등록되지 않습니다.</div>
                              <div>📌 <b>자산카테고리 검증:</b> 관리자 메뉴의 자산 카테고리 등록 목록과 정확히 일치하는 카테고리만 업로드됩니다.</div>
                              <div>📌 <b>일부 칸은 비워도 등록됩니다.</b> 모델명은 미지정 기종, 시리얼번호는 자동 번호, 제조일자는 오늘 날짜, 사진URL은 기본 이미지, 대여가능여부는 대여가능으로 처리됩니다.</div>
                              <div>📌 <b>권장 헤더:</b> 자산카테고리, 자산관리번호, 대여가능여부, 모델명, 시리얼번호, 제조일자, 사진URL, 비고</div>
                              <div>📌 <b>대여불가 처리:</b> 대여가능여부 칸에 대여불가, 불가, unavailable 중 하나가 포함되면 대여불가로 등록됩니다.</div>
                            </div>
                            <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                              <a
                                href="files/sample.xlsx"
                                download
                                className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl text-xs transition-all duration-150 active:scale-[0.98] bg-blue-600 text-white hover:bg-blue-700 px-4 py-3 cursor-pointer shadow-sm shadow-blue-100"
                              >
                                <Save size={14} /> 샘플 엑셀 양식 다운로드
                              </a>
                              <label htmlFor="excel-csv-file-selector" className="inline-flex items-center justify-center gap-2 font-semibold rounded-xl text-xs transition-all duration-150 active:scale-[0.98] bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-3 cursor-pointer shadow-sm">
                                <Plus size={14} /> 엑셀 또는 CSV 파일 선택
                              </label>
                              <input
                                id="excel-csv-file-selector"
                                type="file"
                                accept=".xlsx, .xls, .csv"
                                onChange={handleFileUpload}
                                className="hidden"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 신규 자산 추가 폼 */}
                      {newLaptop && (
                        <div className="rounded-2xl border-2 border-emerald-400/80 bg-emerald-50/20 p-5 space-y-4 shadow-sm animate-fadeIn">
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                            <span className="text-sm font-bold text-slate-900">신규 대여 자산 등록</span>
                            <Button onClick={() => setNewLaptop(null)} variant="outline" className="px-2 py-1 text-xs">닫기</Button>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Select
                              label="자산 카테고리"
                              value={newLaptop.category || data.assetCategories?.[0] || '노트북'}
                              onChange={(v) => setNewLaptop({ ...newLaptop, category: v })}
                            >
                              {(data.assetCategories || ['노트북']).map((category) => (
                                <option key={category} value={category}>{category}</option>
                              ))}
                            </Select>
                            <Input
                              label="자산 관리 번호"
                              value={newLaptop.assetNo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, assetNo: v })}
                              placeholder="예: LAPTOP-2026-16"
                            />
                            <Select
                              label="대여 가능 여부"
                              value={newLaptop.status}
                              onChange={(v) => setNewLaptop({ ...newLaptop, status: v })}
                            >
                              <option value={STATUS.AVAILABLE}>대여가능 (기본)</option>
                              <option value={STATUS.UNAVAILABLE}>대여불가 (고장/수리 등)</option>
                            </Select>
                            <Input
                              label="제작/출고 모델명"
                              value={newLaptop.model}
                              onChange={(v) => setNewLaptop({ ...newLaptop, model: v })}
                              placeholder="예: LG Gram 16 Pro"
                            />
                            <Input
                              label="고유 시리얼 번호 (S/N)"
                              value={newLaptop.serialNo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, serialNo: v })}
                              placeholder="예: SN-2026-10500"
                            />
                            <Input
                              label="출고일"
                              type="date"
                              value={newLaptop.manufactureDate}
                              onChange={(v) => setNewLaptop({ ...newLaptop, manufactureDate: v })}
                            />
                            <Input
                              label="자산 기종 사진 연결 URL"
                              value={newLaptop.photo}
                              onChange={(v) => setNewLaptop({ ...newLaptop, photo: v })}
                              placeholder="사진 URL 입력"
                            />
                            <Input
                              label="비고 / 기재 사항"
                              value={newLaptop.note}
                              onChange={(v) => setNewLaptop({ ...newLaptop, note: v })}
                              placeholder="예: 마우스 포함, 액정 흠집 등"
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                            <Button onClick={() => setNewLaptop(null)} variant="outline">취소</Button>
                            <Button onClick={createLaptop} variant="primary" className="bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100">
                              새 자산 등록 완료
                            </Button>
                          </div>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {data.laptops.map((l, index) => (
                          <React.Fragment key={l.id}>
                            <div
                              className={`rounded-xl p-4 flex flex-col justify-between hover:shadow-sm transition ${
                                editLaptop?.id === l.id
                                  ? 'border-2 border-blue-400/80 bg-blue-50/20'
                                  : 'border border-slate-200 bg-white'
                              }`}
                            >
                              <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl bg-slate-100">
                                <img
                                  src={l.photo}
                                  alt={l.assetNo}
                                  className="h-full w-full object-cover transition duration-350"
                                />
                              </div>

                              <div className="space-y-2">
                                <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                  {l.category}
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900 text-sm">{l.assetNo}</span>
                                  <Badge>{l.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : blockedLaptopIds.has(l.id) ? l.status : STATUS.AVAILABLE}</Badge>
                                </div>
                                <div className="text-xs font-semibold text-slate-700">{l.model}</div>
                                <div className="space-y-0.5 text-[10px] text-slate-500">
                                  <div>S/N: {l.serialNo}</div>
                                  <div>출고: {l.manufactureDate}</div>
                                </div>
                                <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600 border border-slate-100">
                                  💡 {l.note || '특이사항 없음'}
                                </div>
                              </div>
                              <div className="flex gap-2 mt-4">
                                <Button
                                  onClick={() => {
                                    if (editLaptop?.id === l.id) {
                                      setEditLaptop(null);
                                      return;
                                    }

                                    setNewLaptop(null);
                                    setShowUploadPanel(false);
                                    setEditLaptop(l);
                                  }}
                                  variant="outline"
                                  className="flex-1 py-1.5 text-xs rounded-lg"
                                >
                                  <Edit3 size={12} /> 정보 변경 수정
                                </Button>
                                <Button
                                  onClick={() => deleteLaptop(l.id, l.assetNo)}
                                  variant="dangerOutline"
                                  className="py-1.5 text-xs rounded-lg px-3"
                                  title="자산 삭제"
                                >
                                  <Trash2 size={12} /> 삭제
                                </Button>
                              </div>
                            </div>

                            {editLaptopInsertIndex === index && editLaptop && (
                              <div className="col-span-full rounded-2xl border-2 border-blue-400/80 bg-blue-50/20 p-5 space-y-4 shadow-sm animate-fadeIn">
                                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                                  <span className="text-sm font-bold text-slate-900">자산 수정 패널: <b className="text-blue-600">{editLaptop.assetNo}</b></span>
                                  <Button onClick={() => setEditLaptop(null)} variant="outline" className="px-2 py-1 text-xs">닫기</Button>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                  <Select
                                    label="자산 카테고리"
                                    value={editLaptop.category || data.assetCategories?.[0] || '노트북'}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, category: v })}
                                  >
                                    {(data.assetCategories || ['노트북']).map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </Select>
                                  <Input
                                    label="자산 관리 번호"
                                    value={editLaptop.assetNo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, assetNo: v })}
                                  />
                                  <Select
                                    label="대여 가능 여부"
                                    value={editLaptop.status === STATUS.UNAVAILABLE ? STATUS.UNAVAILABLE : STATUS.AVAILABLE}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, status: v })}
                                  >
                                    <option value={STATUS.AVAILABLE}>대여가능 (기본)</option>
                                    <option value={STATUS.UNAVAILABLE}>대여불가 (고장/수리 등)</option>
                                  </Select>
                                  <Input
                                    label="제작/출고 모델명"
                                    value={editLaptop.model}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, model: v })}
                                  />
                                  <Input
                                    label="고유 시리얼 번호 (S/N)"
                                    value={editLaptop.serialNo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, serialNo: v })}
                                  />
                                  <Input
                                    label="출고일"
                                    type="date"
                                    value={editLaptop.manufactureDate}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, manufactureDate: v })}
                                  />
                                  <Input
                                    label="자산 기종 사진 연결 URL"
                                    value={editLaptop.photo}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, photo: v })}
                                  />
                                  <Input
                                    label="비고 / 기재 사항"
                                    value={editLaptop.note}
                                    onChange={(v) => setEditLaptop({ ...editLaptop, note: v })}
                                  />
                                </div>
                                <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/40">
                                  <Button onClick={() => setEditLaptop(null)} variant="outline">취소</Button>
                                  <Button onClick={saveLaptop} variant="primary">자산 정보 최종 저장</Button>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 자산 카테고리 등록 탭 */}
                  {adminTab === 'categories' && (
                    <div className="grid gap-8 md:grid-cols-2">
                      {/* 자산 카테고리 등록 컬럼 */}
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h2 className="text-base font-bold text-slate-900">자산 카테고리 등록</h2>
                          <p className="text-[11px] text-slate-500 mt-0.5">대여 자산 분류를 관리합니다.</p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={newAssetCategory}
                            onChange={(e) => setNewAssetCategory(e.target.value)}
                            placeholder="새로운 자산 카테고리 명칭"
                            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                          />
                          <Button
                            onClick={() => {
                              const categoryName = newAssetCategory.trim();

                              if (!categoryName) {
                                triggerToast('자산 카테고리 명칭을 입력해 주세요.', 'error');
                                return;
                              }

                              if ((data.assetCategories || []).includes(categoryName)) {
                                triggerToast('이미 등록된 자산 카테고리입니다.', 'error');
                                return;
                              }

                              setData((prev) => ({
                                ...prev,
                                assetCategories: [...(prev.assetCategories || []), categoryName],
                              }));
                              setNewAssetCategory('');
                              triggerToast(`[${categoryName}] 자산 카테고리가 새로 생성되었습니다.`, 'success');
                            }}
                            className="px-3 py-2"
                          >
                            <Plus size={16} />
                          </Button>
                        </div>
                        <div className="rounded-xl bg-slate-100 p-4 border border-slate-200/50 text-xs text-slate-600">
                          💡 <b>운영 안내:</b> 현재 단계에서는 자산 카테고리 목록만 등록합니다. 다음 단계에서 각 자산에 카테고리를 연결하면 노트북, 빔프로젝터, 태블릿, 마이크 등으로 대여 자산을 확장할 수 있습니다.
                        </div>
                      </div>

                      {/* 등록된 자산 카테고리 목록 컬럼 */}
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h2 className="text-base font-bold text-slate-900">등록된 자산 카테고리</h2>
                          <p className="text-[11px] text-slate-500 mt-0.5">대여 자산 등록 시 사용할 분류 목록입니다.</p>
                        </div>
                        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                          {(data.assetCategories || []).length === 0 ? (
                            <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-400 text-xs">
                              현재 등록된 자산 카테고리가 없습니다.
                            </div>
                          ) : (
                            (data.assetCategories || []).map((category) => (
                              <div key={category} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700">
                                <span>{category}</span>
                                <Button
                                  onClick={() => {
                                    const isCategoryInUse = data.laptops.some((asset) => (asset.category || '노트북') === category);

                                    if (isCategoryInUse) {
                                      triggerToast('해당 카테고리를 사용하는 자산이 있어 삭제할 수 없습니다.', 'error');
                                      return;
                                    }

                                    setData((prev) => ({
                                      ...prev,
                                      assetCategories: (prev.assetCategories || []).filter((x) => x !== category),
                                    }));
                                    triggerToast(`[${category}] 자산 카테고리가 삭제되었습니다.`, 'success');
                                  }}
                                  variant="ghost"
                                  className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 팀명 및 대여자 관리 탭 */}
                  {adminTab === 'people' && (
                    <div className="grid gap-8 md:grid-cols-2">
                      {/* 부서/팀 관리 컬럼 */}
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h2 className="text-base font-bold text-slate-900">부서 등록</h2>
                          <p className="text-[11px] text-slate-500 mt-0.5">신청자가 소속된 주요 부서를 추가 및 제어합니다.</p>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={newTeam}
                            onChange={(e) => setNewTeam(e.target.value)}
                            placeholder="새로운 등록 부서 명칭"
                            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                          />
                          <Button
                            onClick={() => {
                              if (newTeam.trim()) {
                                setData({ ...data, teams: [...data.teams, newTeam.trim()] });
                                setNewTeam('');
                                triggerToast(`[${newTeam.trim()}] 부서가 새로 생성되었습니다.`, 'success');
                              }
                            }}
                            className="px-3 py-2"
                          >
                            <Plus size={16} />
                          </Button>
                        </div>
                        <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                          {data.teams.map((t) => (
                            <div key={t} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700">
                              <span>{t}</span>
                              <Button
                                onClick={() => {
                                  setData({
                                    ...data,
                                    teams: data.teams.filter((x) => x !== t),
                                    borrowers: data.borrowers.filter((b) => b.team !== t),
                                  });
                                  triggerToast('해당 부서 및 해당 부서 소속 대여자가 전체 취소 제거되었습니다.', 'success');
                                }}
                                variant="ghost"
                                className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 사원 관리 컬럼 */}
                      <div className="space-y-4">
                        <div className="border-b border-slate-100 pb-3">
                          <h2 className="text-base font-bold text-slate-900">사용자 등록</h2>
                          <p className="text-[11px] text-slate-500 mt-0.5">드롭다운 목록에 자동 입력 노출될 소속 부서별 사원을 배정합니다.</p>
                        </div>
                        <div className="space-y-2">
                          <select
                            value={newBorrowerTeam}
                            onChange={(e) => setNewBorrowerTeam(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none"
                          >
                            {data.teams.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <input
                              value={newBorrower}
                              onChange={(e) => setNewBorrower(e.target.value)}
                              placeholder="새로운 배정 사원명"
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none mk-form-border-focus"
                            />
                            <Button
                              onClick={() => {
                                if (newBorrower.trim() && newBorrowerTeam) {
                                  setData({
                                    ...data,
                                    borrowers: [...data.borrowers, { name: newBorrower.trim(), team: newBorrowerTeam }],
                                  });
                                  setNewBorrower('');
                                  triggerToast(`[${newBorrowerTeam}] ${newBorrower.trim()} 사원이 생성되었습니다.`, 'success');
                                }
                              }}
                              className="px-3 py-2"
                            >
                              <Plus size={16} />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                          {data.borrowers.map((b, index) => (
                            <div key={`${b.team}-${b.name}-${index}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2 border border-slate-100 text-xs text-slate-700">
                              <span>
                                {b.name} <span className="text-[10px] text-slate-400">({b.team})</span>
                              </span>
                              <Button
                                onClick={() => {
                                  setData({
                                    ...data,
                                    borrowers: data.borrowers.filter((_, i) => i !== index),
                                  });
                                  triggerToast('사용자 리스트에서 성공적으로 소거 처리 되었습니다.', 'success');
                                }}
                                variant="ghost"
                                className="px-1 py-1 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 기본 환경 설정 탭 */}
                  {adminTab === 'settings' && (
                    <div className="space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h2 className="text-lg font-bold text-slate-900">시스템 설정</h2>
                        <p className="text-xs text-slate-500 mt-1">사용자 페이지의 소속 입력 모드 전환 및 최대 기한 제어가 즉각 가동됩니다.</p>
                      </div>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Select
                          label="부서/팀명 입력 유형 선택"
                          value={tempSettings.teamInputMode}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, teamInputMode: v })
                          }
                        >
                          <option value="dropdown">관리자 등록 부서 리스트</option>
                          <option value="text">신청인 자율 입력</option>
                        </Select>

                        <Select
                          label="사원/신청인 이름 입력 유형 선택"
                          value={tempSettings.borrowerInputMode}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, borrowerInputMode: v })
                          }
                        >
                          <option value="dropdown">관리자 등록 사원 리스트</option>
                          <option value="text">신청인 자율 입력</option>
                        </Select>

                        <Input
                          label="기본 최장 허용 대여 기한 (일수)"
                          type="number"
                          value={tempSettings.maxRentalDays}
                          onChange={(v) =>
                            setTempSettings({ ...tempSettings, maxRentalDays: Number(v) })
                          }
                        />
                      <div>
                        <div className="mb-1.5 text-xs font-semibold text-slate-600 tracking-wide">
                          업무 종료 이후 신청자 대여 시작일 다음 날로 조정
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2.5">
                              <span className="text-xs font-medium text-slate-500">사용여부</span>
                              <button
                                type="button"
                                aria-label="업무 종료 이후 신청자 대여 시작일 다음 날로 조정 사용 여부"
                                aria-pressed={tempSettings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END}
                                onClick={() =>
                                  setTempSettings({
                                    ...tempSettings,
                                    adjustStartDateAfterWorkEnd: !(tempSettings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END),
                                  })
                                }
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                                  (tempSettings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END)
                                    ? 'mk-brand-gradient-r border-transparent'
                                    : 'border-slate-300 bg-slate-200'
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                    (tempSettings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END)
                                      ? 'translate-x-5'
                                      : 'translate-x-0.5'
                                  }`}
                                />
                              </button>
                            </div>

                            <div className="flex items-center gap-2.5">
                              <span className="shrink-0 text-xs font-medium text-slate-500">업무 종료 시간</span>
                              <input
                                type="time"
                                value={tempSettings.workEndTime || DEFAULT_WORK_END_TIME}
                                disabled={!(tempSettings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END)}
                                onChange={(e) =>
                                  setTempSettings({
                                    ...tempSettings,
                                    workEndTime: e.target.value || DEFAULT_WORK_END_TIME,
                                  })
                                }
                                className={`h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition mk-form-focus sm:w-36 ${
                                  (tempSettings.adjustStartDateAfterWorkEnd ?? DEFAULT_ADJUST_START_DATE_AFTER_WORK_END)
                                    ? 'bg-white text-slate-900'
                                    : 'cursor-not-allowed bg-slate-100 text-slate-400'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                      <div className="rounded-xl bg-slate-100 p-4 border border-slate-200/50 text-xs text-slate-600">
                        💡 <b>운영 권장사항 안내:</b> 실제 사내 보안망 연동 개발 단계에서는 AD 연동 인증, 부서별 허용 기한 할당제, Slack/Alimtalk 실시간 전송, 지연 지연자 메일 자동 발송 모듈을 접목하여 완벽한 자동화를 꾀할 수 있습니다.
                      </div>

                      {/* 하단 저장 및 취소 액션 버튼 컨테이너 추가 */}
                      <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-200/60">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTempSettings(data.settings);
                            triggerToast('설정 변경사항이 취소되고 이전 상태로 복원되었습니다.', 'success');
                          }}
                        >
                          취소
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => {
                            setData((prev) => ({
                              ...prev,
                              settings: tempSettings,
                            }));
                            triggerToast('설정 변경사항이 원장에 성공적으로 저장 및 반영되었습니다.', 'success');
                          }}
                        >
                          변경사항 저장
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* --- 모던 Custom Toast (iframe 환경 완벽 최적화) --- */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-4.5 py-3.5 shadow-xl border text-xs font-semibold ${
              toast.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200 shadow-rose-100/40'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100/40'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="text-rose-600" size={18} />
            ) : (
              <CheckCircle2 className="text-emerald-600" size={18} />
            )}
            <span>{toast.message}</span>
            <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-slate-700">
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 모던 Custom Confirm Modal (iframe 차단 방지) --- */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <h3 className="text-base font-bold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmModal(null)} className="rounded-xl px-4 py-2">
                취소
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
                className="rounded-xl px-4 py-2"
              >
                확인 및 실행
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// 간단한 자물쇠/잠금용 인라인 SVG 아이콘
function LockIcon({ size }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  );
}

export default App;