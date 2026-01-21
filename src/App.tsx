import { useState, useEffect, useMemo } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Save, Plus, Trash2, RefreshCw, Loader2, Settings, LayoutTemplate, Coffee, Camera, ChevronDown, ArrowUp, ArrowDown, Move, ArrowLeft, CheckCircle2, ListFilter, Edit3, X, Globe, Eye, Ban, Layers, Lock, Unlock, AlertTriangle, Info, Search } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// ★あなたのFunctions URL（変更不要）
// ※前回の作業で設定したURLのままでOKです
const TRANSLATE_API_URL = "https://us-central1-mockteria-757c7.cloudfunctions.net/translate"; 

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const PREVIEW_URL = "http://mockkteria-757c7.web.app";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const LANGUAGES = [
  { code: 'en', target: 'EN-US' },
  { code: 'fr', target: 'FR' },
  { code: 'it', target: 'IT' },
  { code: 'de', target: 'DE' },
  { code: 'ko', target: 'KO' },
  { code: 'zh', target: 'ZH' },
];

type MenuType = 'grand' | 'seasonal';

const INPUT_STYLE = "w-full bg-zinc-950 border border-zinc-600 rounded-xl p-3 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none transition-all shadow-inner";
const CARD_STYLE = "bg-zinc-900 p-5 rounded-3xl border border-zinc-700/50 space-y-4 shadow-xl";

// AIチェック用
const calculateSimilarity = (s1: string, s2: string): number => {
  if (!s1 || !s2) return 0;
  const a = s1.toLowerCase().replace(/\s+/g, '');
  const b = s2.toLowerCase().replace(/\s+/g, '');
  if (a.includes(b) || b.includes(a)) return 1.0;
  
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + indicator);
    }
  }
  return 1.0 - (matrix[b.length][a.length] / Math.max(a.length, b.length));
};

export default function AdminApp() {
  // Data
  const [items, setItems] = useState<any[]>([]);
  const [categoryList, setCategoryList] = useState<{name: string, type: MenuType}[]>([]);
  const [featuredSlots, setFeaturedSlots] = useState<any[]>(Array(5).fill({}));
  const [tabSettings, setTabSettings] = useState<any>({ grand: { jp: "" }, seasonal: { jp: "" } });
  const [splashSettings, setSplashSettings] = useState<any>({});
  
  // UI State
  const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'header' | 'settings'>('items');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting & Editing
  const [sortPhase, setSortPhase] = useState<'none' | 'select_category' | 'sorting'>('none');
  const [targetCategory, setTargetCategory] = useState<string>("");
  const [sortingItems, setSortingItems] = useState<any[]>([]);
  const [isCatSorting, setIsCatSorting] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editingCategory, setEditingCategory] = useState<{name: string, type: MenuType} | null>(null);
  const [isGrandLocked, setIsGrandLocked] = useState(true);

  // Warnings
  const [nameWarning, setNameWarning] = useState<string | null>(null);
  const [catWarning, setCatWarning] = useState<string | null>(null);

  // Inputs
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<MenuType>('seasonal');
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemType, setNewItemType] = useState<MenuType>("seasonal");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemImage, setNewItemImage] = useState("");

  // Sync Data
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "menuData"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (sortPhase === 'none' && !isCatSorting && !editingItem && !editingCategory) {
            setItems(data.items || []);
            setFeaturedSlots(data.featuredSlots || Array(5).fill({}));
            setTabSettings(data.tabSettings || { grand: { jp: "定番メニュー" }, seasonal: { jp: "限定メニュー" } });
            setSplashSettings(data.splashSettings || {});
            
            let rawCats = data.categoryList || [];
            let safeCats: {name: string, type: MenuType}[] = [];
            if (Array.isArray(rawCats)) {
                safeCats = rawCats.map((c: any) => {
                    if (typeof c === 'string') {
                        const item = (data.items || []).find((i:any) => i.category === c);
                        return { name: c, type: item?.type || 'grand' };
                    } else if (c && typeof c === 'object') {
                        return { name: c.name || "Unknown", type: c.type || 'grand' };
                    }
                    return null;
                }).filter(Boolean) as any;
            }
            setCategoryList(safeCats);
        }
      }
    });
    return () => unsub();
  }, [sortPhase, isCatSorting, editingItem, editingCategory]);

  useEffect(() => {
    if (isGrandLocked) {
      setNewItemType('seasonal');
      setNewCatType('seasonal');
    }
  }, [isGrandLocked]);

  useEffect(() => {
    if (!newItemName) { setNameWarning(null); return; }
    const similarItem = items.find(i => calculateSimilarity(i.name, newItemName) > 0.85);
    if (similarItem) {
      setNameWarning(similarItem.name === newItemName ? `⚠️ 警告: 「${similarItem.name}」は既に登録されています。` : `⚠️ AI検知: 「${similarItem.name}」と酷似しています。`);
    } else { setNameWarning(null); }
  }, [newItemName, items]);

  useEffect(() => {
    if (!newCatName) { setCatWarning(null); return; }
    const similarCat = categoryList.find(c => calculateSimilarity(c.name, newCatName) > 0.85);
    if (similarCat) {
      setCatWarning(similarCat.name === newCatName ? `⚠️ 「${similarCat.name}」は既に存在します。` : `⚠️ AI検知: 「${similarCat.name}」と類似しています。`);
    } else { setCatWarning(null); }
  }, [newCatName, categoryList]);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    return items.filter(item => {
        const targetString = `${item.name} ${item.desc} ${item.price} ${item.category}`;
        return calculateSimilarity(targetString, searchQuery) > 0.3;
    });
  }, [items, searchQuery]);

  const filteredCategoryList = useMemo(() => categoryList.filter(c => c.type === newItemType), [categoryList, newItemType]);

  const translateTexts = async (texts: string[], targetLang: string) => {
    if (TRANSLATE_API_URL.includes("xxxxxx")) return texts;
    try {
      const response = await fetch(TRANSLATE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texts, target_lang: targetLang })
      });
      
      if (!response.ok) {
          // エラーでも止まらずに原文を返す
          console.warn(`Translation failed for ${targetLang}`);
          return texts;
      }

      const data = await response.json();
      return data.translations.map((t: any) => t.text);
    } catch (e) { 
      console.error(e);
      return texts; 
    }
  };

  const saveToFirebase = async (payload: any) => {
    setIsProcessing(true);
    try { 
        await setDoc(doc(db, "settings", "menuData"), { ...payload, updatedAt: new Date() }, { merge: true }); 
    } catch (e: any) { 
        console.error(e);
        if (e.code === 'resource-exhausted') alert("⚠️ 容量オーバー: 画像を減らしてください");
        else alert("保存エラー: " + e.message); 
    } finally { setIsProcessing(false); }
  };

  const handleImageUpload = async (e: any, callback: (url: string) => void) => {
    const file = e.target.files?.[0]; 
    if (!file) return;

    setUploading(true);

    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const maxW = 800;
            const scale = maxW / img.width;
            canvas.width = maxW;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
    
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    setUploading(false);
                    return;
                }
                try {
                    const fileName = `menu-images/${Date.now()}-${file.name}`;
                    const storageRef = ref(storage, fileName);
                    await uploadBytes(storageRef, blob);
                    const downloadURL = await getDownloadURL(storageRef);
                    callback(downloadURL);
                } catch (error) {
                    console.error("Upload failed", error);
                    alert("画像のアップロードに失敗しました");
                } finally {
                    setUploading(false);
                }
            }, 'image/jpeg', 0.8);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, 100);
  };

  const addCategory = async () => {
    if (!newCatName) return;
    if (categoryList.some(c => c.name === newCatName)) return alert("同名カテゴリが存在します");
    const newList = [...categoryList, { name: newCatName, type: newCatType }];
    setCategoryList(newList); setNewCatName(""); setShowCatForm(false);
    await saveToFirebase({ categoryList: newList });
    alert("カテゴリを追加しました");
  };

  // ★修正: カテゴリ更新（翻訳を直列化）
  const executeCategoryUpdate = async (oldName: string, newName: string, type: MenuType) => {
      setIsProcessing(true);
      try {
        const translations: any = {};
        // 直列処理に変更
        for (const lang of LANGUAGES) {
            const res = await translateTexts([newName], lang.target);
            translations[lang.code] = res[0];
        }
        
        const newList = categoryList.map(c => c.name === oldName ? { name: newName, type } : c);
        const newItems = items.map(item => {
            if (item.category === oldName) {
                const newTrans = JSON.parse(JSON.stringify(item.translations || {}));
                LANGUAGES.forEach(l => { if (!newTrans[l.code]) newTrans[l.code] = {}; newTrans[l.code].category = translations[l.code]; });
                return { ...item, category: newName, type, categoryEnglish: translations['en'], translations: newTrans };
            }
            return item;
        });
        setCategoryList(newList); setItems(newItems); setEditingCategory(null);
        await saveToFirebase({ categoryList: newList, items: newItems });
        alert("更新しました");
      } catch (e) { alert("エラー"); } finally { setIsProcessing(false); }
  };

  const deleteCategory = async (catName: string) => {
    if (!confirm(`カテゴリ「${catName}」を削除しますか？`)) return;
    const newList = categoryList.filter(c => c.name !== catName);
    setCategoryList(newList);
    await saveToFirebase({ categoryList: newList });
  };

  // ★修正: 新規登録（翻訳を直列化）
  const createNewItem = async () => {
    if (!newItemName || !newItemCategory) return alert("入力不備があります");
    if (nameWarning && !confirm(`警告: ${nameWarning}\n登録しますか？`)) return;
    setIsProcessing(true);
    try {
      const trans: any = {};
      // 直列処理に変更
      for (const l of LANGUAGES) {
          const res = await translateTexts([newItemName, newItemDesc, newItemCategory], l.target);
          trans[l.code] = { name: res[0], desc: res[1], category: res[2] };
          // API制限回避のため、少し待機（オプション）
          // await new Promise(r => setTimeout(r, 100)); 
      }

      const newItem = {
        id: `id-${Date.now()}`, name: newItemName, desc: newItemDesc, price: newItemPrice, image: newItemImage, category: newItemCategory, type: newItemType, categoryEnglish: trans['en']?.category || newItemCategory, isRecommended: false, isInsta: false, isSoldOut: false, translations: trans
      };
      await saveToFirebase({ items: [...items, newItem] });
      setNewItemName(""); setNewItemDesc(""); setNewItemPrice(""); setNewItemImage(""); setShowItemForm(false);
      alert("登録しました");
    } catch (e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const toggleSoldOut = async (item: any) => {
    const newItems = items.map(i => i.id === item.id ? { ...i, isSoldOut: !i.isSoldOut } : i);
    setItems(newItems);
    await saveToFirebase({ items: newItems });
  };

  const saveEditedItem = async () => {
    if (!editingItem) return;
    const newItems = items.map(i => i.id === editingItem.id ? editingItem : i);
    await saveToFirebase({ items: newItems });
    setEditingItem(null);
    alert("保存しました");
  };

  // ★修正: 再翻訳（翻訳を直列化）
  const reTranslateAndSaveItem = async () => {
    if (!editingItem) return;
    if (!confirm(`再翻訳して上書きしますか？`)) return;
    setIsProcessing(true);
    try {
      const translations: any = {};
      // 直列処理に変更
      for (const lang of LANGUAGES) {
          const results = await translateTexts([editingItem.name, editingItem.desc, editingItem.category], lang.target);
          translations[lang.code] = { name: results[0], desc: results[1], category: results[2] };
      }

      const updatedItem = { ...editingItem, translations, categoryEnglish: translations['en']?.category || editingItem.category };
      const newItems = items.map(i => i.id === editingItem.id ? updatedItem : i);
      await saveToFirebase({ items: newItems });
      setEditingItem(null);
      alert("翻訳更新しました");
    } catch(e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const deleteItem = async (itemId: string) => {
      if(!confirm("本当に削除しますか？\nこの操作は取り消せません。")) return;
      
      const targetItem = items.find(i => i.id === itemId);
      
      if (targetItem && targetItem.image && targetItem.image.startsWith('http')) {
          try {
              const fileRef = ref(storage, targetItem.image);
              await deleteObject(fileRef);
              console.log("Image deleted from storage");
          } catch (e) {
              console.warn("Could not delete image from storage (might already be deleted or invalid path)", e);
          }
      }

      const newItems = items.filter(i => i.id !== itemId);
      await saveToFirebase({ items: newItems });
      setEditingItem(null);
      alert("削除しました");
  };

  // Sorting
  const startSorting = () => setSortPhase('select_category');
  const exitSorting = () => { setSortPhase('none'); setTargetCategory(""); setSortingItems([]); };
  const selectCategoryToSort = (cat: string) => { setTargetCategory(cat); setSortingItems(items.filter(i => i.category === cat)); setSortPhase('sorting'); };
  const moveSortItem = (idx: number, dir: 'up' | 'down') => {
    const arr = [...sortingItems];
    if (dir === 'up' && idx > 0) [arr[idx], arr[idx-1]] = [arr[idx-1], arr[idx]];
    if (dir === 'down' && idx < arr.length-1) [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
    setSortingItems(arr);
  };
  const saveSortedOrder = async () => {
    const others = items.filter(i => i.category !== targetCategory);
    await saveToFirebase({ items: [...others, ...sortingItems] });
    exitSorting(); alert("保存しました");
  };

  const moveCategory = (idx: number, dir: 'up' | 'down', type: MenuType) => {
      const targetList = categoryList.filter(c => c.type === type);
      const otherList = categoryList.filter(c => c.type !== type);
      if (dir === 'up' && idx > 0) [targetList[idx], targetList[idx - 1]] = [targetList[idx - 1], targetList[idx]];
      else if (dir === 'down' && idx < targetList.length - 1) [targetList[idx], targetList[idx + 1]] = [targetList[idx + 1], targetList[idx]];
      
      const newSeasonal = type === 'seasonal' ? targetList : otherList.filter(c => c.type === 'seasonal');
      const newGrand = type === 'grand' ? targetList : otherList.filter(c => c.type === 'grand');
      setCategoryList([...newSeasonal, ...newGrand]);
  };
  const saveCategoryOrder = async () => {
      await saveToFirebase({ categoryList });
      setIsCatSorting(false);
      alert("カテゴリ順序を保存しました");
  };

  // ★修正: ヘッダー設定（翻訳を直列化）
  const saveFeaturedSettings = async () => {
    setIsProcessing(true);
    try {
      let nextItems = [...items];
      const nextSlots = [...featuredSlots];
      
      // ループ内でawaitを使うため、Promise.allではなくforループに変更
      const updatedSlots = [];
      for (let i = 0; i < nextSlots.length; i++) {
          const slot = nextSlots[i];
          if (!slot.name) {
              updatedSlots.push(slot);
              continue;
          }
          if (slot.type === 'event') {
              updatedSlots.push({ ...slot, itemId: null });
              continue;
          }
          if (slot.itemId) {
             const existingIndex = nextItems.findIndex(item => item.id === slot.itemId);
             if(existingIndex !== -1) nextItems[existingIndex] = { ...nextItems[existingIndex], isRecommended: true };
             updatedSlots.push(slot);
             continue;
          }

          // 新規作成の場合の翻訳
          const translations: any = {};
          for (const lang of LANGUAGES) {
              const results = await translateTexts([slot.name, slot.desc, slot.category || "NEW"], lang.target);
              translations[lang.code] = { name: results[0], desc: results[1], category: results[2] };
          }

          const newItemId = `id-feat-${Date.now()}-${i}`;
          const newItem = {
            id: newItemId, name: slot.name, desc: slot.desc, price: slot.price, image: slot.image, category: slot.category || "NEW ITEMS", categoryEnglish: translations['en']?.category || slot.category, type: slot.menuType || "grand", isRecommended: true, isSoldOut: false, translations: translations
          };
          nextItems.push(newItem);
          updatedSlots.push({ ...slot, itemId: newItemId });
      }

      await setDoc(doc(db, "settings", "menuData"), { items: nextItems, featuredSlots: updatedSlots, tabSettings, splashSettings, updatedAt: new Date() }, { merge: true });
      alert("更新完了！");
    } catch (e: any) { 
        console.error(e);
        if (e.code === 'resource-exhausted') alert("⚠️ 容量オーバー: 画像を減らしてください");
        else alert("保存エラー"); 
    } finally { setIsProcessing(false); }
  };

  // ★修正: 一般設定（翻訳を直列化）
  const saveGeneralSettings = async () => {
    setIsProcessing(true);
    try {
      const newTabSettings = { ...tabSettings };
      
      // 直列処理に変更
      for (const lang of LANGUAGES) {
          const results = await translateTexts([tabSettings.grand?.jp || "", tabSettings.seasonal?.jp || ""], lang.target);
          if (!newTabSettings.grand) newTabSettings.grand = {};
          if (!newTabSettings.seasonal) newTabSettings.seasonal = {};
          newTabSettings.grand[lang.code] = results[0];
          newTabSettings.seasonal[lang.code] = results[1];
      }

      await setDoc(doc(db, "settings", "menuData"), { items, featuredSlots, tabSettings: newTabSettings, splashSettings, updatedAt: new Date(), categoryList }, { merge: true });
      alert("設定を保存しました");
    } catch(e) { console.error(e); } finally { setIsProcessing(false); }
  };

  const displayCategories = categoryList.map(c => c?.name || "Unknown");
  const sortingSeasonalCats = categoryList.filter(c => c.type === 'seasonal');
  const sortingGrandCats = categoryList.filter(c => c.type === 'grand');

  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-white tracking-[0.2em] font-['Shippori_Mincho']">MOCKTERIA</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsGrandLocked(!isGrandLocked)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all ${isGrandLocked ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-orange-500 text-black border border-orange-400 shadow-lg shadow-orange-900/50'}`}>
            {isGrandLocked ? <Lock size={14}/> : <Unlock size={14}/>}
            {isGrandLocked ? '定番ロック' : '編集OK'}
          </button>
          <a href={PREVIEW_URL} target="_blank" rel="noopener noreferrer" className="bg-zinc-800 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"><Eye size={14}/> Preview</a>
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {activeTab === 'items' && (
          <div className="space-y-6">
            <div className="flex justify-end h-10">
              {sortPhase === 'none' ? (
                <button onClick={startSorting} className="bg-zinc-800 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-black">
                  <Move size={14} className="text-orange-500"/> 並び替えモードへ
                </button>
              ) : (
                <button onClick={exitSorting} className="bg-zinc-800 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-black">
                  <Plus size={14} className="text-orange-500"/> 商品登録モードへ
                </button>
              )}
            </div>

            {/* AI Search Bar */}
            {sortPhase === 'none' && !editingItem && (
                <div className="relative mb-4">
                    <Search className="absolute left-4 top-3.5 text-zinc-500" size={18} />
                    <input 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="商品名、価格、カテゴリで検索..." 
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all placeholder-zinc-600"
                    />
                    {searchQuery && (
                        <div className="absolute right-4 top-3.5 text-[10px] text-orange-500 font-bold animate-pulse">
                            AI Filtering...
                        </div>
                    )}
                </div>
            )}

            {sortPhase === 'none' && (
              <>
                {!showItemForm && !searchQuery ? (
                    <button onClick={() => setShowItemForm(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-400 font-bold flex items-center justify-center gap-2 hover:bg-zinc-900 hover:text-white hover:border-zinc-500 transition-all active:scale-95">
                        <Plus size={20}/> 新規商品を登録する
                    </button>
                ) : showItemForm && (
                    <div className={CARD_STYLE + " animate-in fade-in slide-in-from-top-2"}>
                        <div className="flex justify-between items-center"><span className="font-bold text-sm text-orange-500">新規商品登録</span><button onClick={() => setShowItemForm(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button></div>
                        <div className="flex gap-4">
                            <div className="w-24 h-24 bg-zinc-950 rounded-2xl border border-zinc-700 flex items-center justify-center relative overflow-hidden shrink-0 group">
                                {uploading ? <Loader2 className="animate-spin text-orange-500" /> : (newItemImage ? <img src={newItemImage} className="w-full h-full object-cover" /> : <Camera className="text-zinc-600" />)}
                                <input type="file" className="absolute inset-0 opacity-0" onChange={e => handleImageUpload(e, setNewItemImage)} />
                            </div>
                            <div className="flex-1 space-y-3">
                            <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="名前" className={INPUT_STYLE} />
                            <input value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} placeholder="価格" className={INPUT_STYLE} />
                            </div>
                        </div>
                        {nameWarning && <div className="bg-amber-900/40 text-amber-200 text-xs p-3 rounded-xl border border-amber-500/30 flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5"/><span>{nameWarning}</span></div>}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <div className="relative"><select value={newItemType} onChange={e => { setNewItemType(e.target.value as MenuType); setNewItemCategory(""); }} className={`${INPUT_STYLE} appearance-none ${isGrandLocked ? 'text-zinc-500 border-zinc-800' : 'text-white'}`} disabled={isGrandLocked}><option value="seasonal">限定 (Seasonal)</option><option value="grand">定番 (Grand)</option></select><ChevronDown size={14} className="absolute right-3 top-4 text-zinc-500 pointer-events-none" /></div>
                            <div className="relative"><select value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)} className={`${INPUT_STYLE} appearance-none`}><option value="">選択...</option>{filteredCategoryList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-4 text-zinc-500 pointer-events-none" /></div>
                        </div>
                        <textarea value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="説明文" className={`${INPUT_STYLE} h-24`} />
                        <button onClick={createNewItem} disabled={isProcessing || uploading} className="w-full bg-orange-500 text-black font-black py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-orange-900/20">{isProcessing ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18} />} 翻訳して登録</button>
                    </div>
                )}

                <div className="space-y-8 pt-4">
                  {searchQuery && filteredItems.length === 0 && (
                      <div className="text-center py-10 text-zinc-500 text-xs">
                          見つかりませんでした
                      </div>
                  )}

                  {['seasonal', 'grand'].map((type) => {
                    const itemsInType = filteredItems.filter(i => (i.type || 'grand') === type);
                    if (itemsInType.length === 0) return null;

                    return (
                        <div key={type} className={`border-l-4 pl-4 ${type === 'grand' ? 'border-blue-500' : 'border-green-500'}`}>
                        <h3 className="text-sm font-black mb-4 uppercase tracking-widest flex items-center gap-2">{type === 'grand' ? '定番メニュー' : '限定メニュー'} {type==='grand' && isGrandLocked && <Lock size={12} className="text-zinc-500"/>}</h3>
                        {categoryList.filter(c => c.type === type).map(cat => {
                            const targetItems = itemsInType.filter(i => i.category === cat.name);
                            if (targetItems.length === 0) return null;

                            return (
                            <div key={cat.name} className="mb-6">
                                <h4 className="text-xs text-zinc-500 mb-2 font-bold px-1">{cat.name}</h4>
                                <div className="space-y-2">
                                {targetItems.map(item => (
                                    <div key={item.id} className={`bg-zinc-900 p-3 rounded-2xl border flex gap-3 items-center shadow-lg ${item.isSoldOut ? 'border-red-500/30 bg-red-950/10' : 'border-zinc-700/50'}`}>
                                    <div className="w-12 h-12 bg-black rounded-xl overflow-hidden relative shrink-0 border border-zinc-800"><img src={item.image} className={`w-full h-full object-cover ${item.isSoldOut ? 'opacity-40 grayscale' : ''}`} />{item.isSoldOut && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[8px] font-black text-red-500">SOLD</div>}</div>
                                    <div className="flex-1 min-w-0"><div className={`font-bold text-sm truncate ${item.isSoldOut ? 'text-zinc-500 line-through' : ''}`}>{item.name}</div><div className="text-[10px] text-zinc-500 truncate">¥{item.price}</div></div>
                                    <button onClick={() => toggleSoldOut(item)} className={`p-2 rounded-xl border active:scale-90 ${item.isSoldOut ? 'bg-red-500 text-white border-red-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'}`}><Ban size={16}/></button>
                                    <button onClick={() => setEditingItem({...item})} className={`p-2 rounded-xl border active:scale-90 ${isGrandLocked && type === 'grand' ? 'bg-zinc-900 text-zinc-700 border-transparent cursor-not-allowed' : 'bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700'}`} disabled={isGrandLocked && type === 'grand'}><Edit3 size={16}/></button>
                                    <button onClick={() => deleteItem(item.id)} className={`p-2 rounded-xl border active:scale-90 ${isGrandLocked && type === 'grand' ? 'bg-zinc-900 text-zinc-700 border-transparent cursor-not-allowed' : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'}`} disabled={isGrandLocked && type === 'grand'}><Trash2 size={16}/></button>
                                    </div>
                                ))}
                                </div>
                            </div>
                            )
                        })}
                        </div>
                    )
                  })}
                </div>
              </>
            )}

            {sortPhase === 'select_category' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pt-4">
                <div className="text-center space-y-2 mb-8"><ListFilter className="mx-auto text-orange-500" size={32} /><h2 className="text-lg font-bold">並び替えるカテゴリを選択</h2></div>
                <div className="grid gap-3">{categoryList.map(cat => (<button key={cat.name} onClick={() => selectCategoryToSort(cat.name)} className="w-full bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left flex justify-between items-center active:scale-95 transition-transform hover:border-orange-500/50"><div className="flex flex-col"><span className="font-bold text-sm">{cat.name}</span><span className={`text-[10px] uppercase font-bold ${cat.type === 'grand' ? 'text-blue-400' : 'text-green-400'}`}>{cat.type}</span></div><span className="text-xs bg-black/50 px-3 py-1 rounded-full text-zinc-400">{items.filter(i => i.category === cat.name).length} items</span></button>))}</div>
              </div>
            )}

            {sortPhase === 'sorting' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 pt-4">
                <div className="flex items-center justify-between"><button onClick={() => setSortPhase('select_category')} className="text-zinc-400 text-xs flex items-center gap-1 active:scale-90 transition-transform"><ArrowLeft size={16}/> 戻る</button><button onClick={saveSortedOrder} className="bg-orange-500 text-black px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-1 active:scale-95 shadow-xl"><CheckCircle2 size={16}/> 保存して終了</button></div>
                <div className="space-y-2">{sortingItems.map((item, idx) => (<div key={item.id} className="bg-zinc-800 p-3 rounded-2xl border border-orange-500/30 flex items-center justify-between shadow-2xl"><div className="flex items-center gap-3"><div className="w-12 h-12 bg-black rounded-xl overflow-hidden shrink-0"><img src={item.image} className="w-full h-full object-cover" /></div><span className="font-bold text-sm truncate max-w-[140px]">{item.name}</span></div><div className="flex gap-1"><button onClick={() => moveSortItem(idx, 'up')} className="p-3 bg-black/40 rounded-xl text-white disabled:opacity-20 active:scale-90" disabled={idx === 0}><ArrowUp size={20}/></button><button onClick={() => moveSortItem(idx, 'down')} className="p-3 bg-black/40 rounded-xl text-white disabled:opacity-20 active:scale-90" disabled={idx === sortingItems.length - 1}><ArrowDown size={20}/></button></div></div>))}</div>
              </div>
            )}
          </div>
        )}

        {/* Categories Tab */}
        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="flex justify-end h-10">
                {!isCatSorting ? (
                    <button onClick={() => setIsCatSorting(true)} className="bg-zinc-800 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-black">
                        <Move size={14} className="text-orange-500"/> 並び替えモードへ
                    </button>
                ) : (
                    <button onClick={saveCategoryOrder} className="bg-orange-500 text-black border border-orange-500 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-black animate-pulse">
                        <CheckCircle2 size={14}/> 並び順を保存
                    </button>
                )}
            </div>

            {!isCatSorting && (
                <>
                    {!showCatForm ? (
                        <button onClick={() => setShowCatForm(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-400 font-bold flex items-center justify-center gap-2 hover:bg-zinc-900 hover:text-white hover:border-zinc-500 transition-all active:scale-95">
                            <Plus size={20}/> 新規カテゴリを追加する
                        </button>
                    ) : (
                        <div className={CARD_STYLE + " animate-in fade-in slide-in-from-top-2"}>
                            <div className="flex justify-between items-center"><h3 className="font-bold text-orange-500 text-sm flex items-center gap-2">新規カテゴリ追加</h3><button onClick={() => setShowCatForm(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button></div>
                            {catWarning && <div className="bg-amber-900/40 text-amber-200 text-xs p-3 rounded-xl border border-amber-500/30 flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5"/><span>{catWarning}</span></div>}
                            <div className="space-y-3">
                                <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="カテゴリ名" className={INPUT_STYLE} />
                                <div className="flex gap-2">
                                <button onClick={() => !isGrandLocked && setNewCatType('grand')} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${newCatType === 'grand' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-zinc-900 text-zinc-500 border border-zinc-700'} ${isGrandLocked ? 'cursor-not-allowed opacity-30' : ''}`} disabled={isGrandLocked}>定番用 {isGrandLocked && <Lock size={10} className="inline"/>}</button>
                                <button onClick={() => setNewCatType('seasonal')} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${newCatType === 'seasonal' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-zinc-900 text-zinc-500 border border-zinc-700'}`}>限定用</button>
                                </div>
                                <button onClick={addCategory} className="w-full bg-white text-black font-black py-4 rounded-2xl active:scale-95 transition-transform mt-2">作成する</button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6 pt-2">
                    {['seasonal', 'grand'].map(type => (
                        <div key={type} className="space-y-3">
                        <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] ${type === 'grand' ? 'text-blue-500' : 'text-green-500'}`}>{type === 'grand' ? 'Grand Categories' : 'Seasonal Categories'}</h4>
                        {categoryList.filter(c => c.type === type).map(cat => (
                            <div key={cat.name} className={`bg-zinc-900 p-4 rounded-2xl border border-zinc-700/50 flex justify-between items-center shadow-md ${type === 'grand' && isGrandLocked ? 'opacity-60' : ''}`}>
                                {editingCategory?.name === cat.name ? (
                                    <div className="flex gap-2 w-full">
                                        <input autoFocus value={editingCategory.name} onChange={e => setEditingCategory({...editingCategory, name: e.target.value})} className={INPUT_STYLE} />
                                        <button onClick={() => executeCategoryUpdate(cat.name, editingCategory.name, cat.type as MenuType)} disabled={isProcessing} className="bg-orange-500 text-black px-3 rounded-lg font-bold text-xs">{isProcessing ? <Loader2 size={14}/> : "保存"}</button>
                                        <button onClick={() => setEditingCategory(null)} className="bg-zinc-800 text-white px-3 rounded-lg text-xs border border-zinc-600">停止</button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-bold text-sm tracking-wider">{cat.name}</span>
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => setEditingCategory({name: cat.name, type: cat.type})} 
                                                className={`p-2.5 rounded-xl active:scale-90 ${isGrandLocked && type === 'grand' ? 'bg-zinc-900 text-zinc-700' : 'bg-zinc-800 text-white border border-zinc-700 hover:bg-zinc-700'}`}
                                                disabled={isGrandLocked && type === 'grand'}
                                            >
                                                <Edit3 size={16}/>
                                            </button>
                                            <button 
                                                onClick={() => deleteCategory(cat.name)} 
                                                className={`p-2.5 rounded-xl active:scale-90 ${isGrandLocked && type === 'grand' ? 'bg-zinc-900 text-zinc-700' : 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'}`}
                                                disabled={isGrandLocked && type === 'grand'}
                                            >
                                                <Trash2 size={16}/>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {categoryList.filter(c => c.type === type).length === 0 && <p className="text-[10px] text-zinc-700 italic px-2">なし</p>}
                        </div>
                    ))}
                    </div>
                </>
            )}

            {isCatSorting && (
                <div className="space-y-6 pt-4 animate-in fade-in slide-in-from-right-4">
                    <div className="text-center mb-6"><h2 className="text-lg font-bold">カテゴリ順序の変更</h2><p className="text-xs text-zinc-500">上下ボタンで並び替えて保存してください</p></div>
                    <div className="space-y-8">
                        {['seasonal', 'grand'].map(type => {
                            const cats = type === 'seasonal' ? sortingSeasonalCats : sortingGrandCats;
                            if (cats.length === 0) return null;
                            return (
                                <div key={type}>
                                    <h4 className={`text-[10px] font-black uppercase mb-3 pl-2 border-l-2 ${type==='grand'?'text-blue-500 border-blue-500':'text-green-500 border-green-500'}`}>{type.toUpperCase()}</h4>
                                    <div className="space-y-2">
                                        {categoryList.map((cat, idx) => {
                                            if (cat.type !== type) return null;
                                            return (
                                                <div key={cat.name} className="bg-zinc-800 p-3 rounded-2xl border border-orange-500/30 flex items-center justify-between shadow-2xl">
                                                    <div className="flex flex-col"><span className="font-bold text-sm">{cat.name}</span></div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => moveCategory(idx, 'up', cat.type)} className="p-3 bg-black/40 rounded-xl text-white disabled:opacity-20 active:scale-90" disabled={false}><ArrowUp size={20}/></button>
                                                        <button onClick={() => moveCategory(idx, 'down', cat.type)} className="p-3 bg-black/40 rounded-xl text-white disabled:opacity-20 active:scale-90" disabled={false}><ArrowDown size={20}/></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
          </div>
        )}

        {/* Header Tab */}
        {activeTab === 'header' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-700/50 sticky top-16 z-20 shadow-xl">
              <span className="font-bold text-sm">ヘッダー (Featured)</span>
              <button onClick={saveFeaturedSettings} disabled={isProcessing} className="bg-white text-black px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform">
                {isProcessing ? <Loader2 className="animate-spin" size={14}/> : <Save size={14} />} 保存
              </button>
            </div>
            
            <div className="space-y-6">
              {featuredSlots.map((slot, idx) => (
                <div key={idx} className={CARD_STYLE}>
                  <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase mb-3">
                    <span>SLOT {idx + 1}</span>
                    <span className={slot.itemId ? "text-green-500" : "text-orange-500"}>{slot.itemId ? "🔗 既存リンク" : "✨ 新規作成"}</span>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="aspect-video bg-zinc-950 rounded-xl overflow-hidden relative border border-zinc-700 group">
                      {slot.image ? <img src={slot.image} className="w-full h-full object-cover opacity-80" /> : <div className="w-full h-full flex items-center justify-center text-zinc-700"><Camera /></div>}
                      <input type="file" className="absolute inset-0 opacity-0 z-10" onChange={e => handleImageUpload(e, (b64) => { const ns=[...featuredSlots]; ns[idx]={...ns[idx], image: b64}; setFeaturedSlots(ns); })} />
                      <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white pointer-events-none">画像変更</div>
                    </div>

                    <select 
                      className={INPUT_STYLE}
                      value={slot.itemId || ""}
                      onChange={(e) => {
                        const targetId = e.target.value;
                        const ns = [...featuredSlots];
                        if (!targetId) {
                          ns[idx] = { ...ns[idx], itemId: null };
                        } else {
                          const item = items.find(i => i.id === targetId);
                          if (item) ns[idx] = { ...ns[idx], itemId: item.id, name: item.name, desc: item.desc, price: item.price, image: item.image || ns[idx].image, category: item.category };
                        }
                        setFeaturedSlots(ns);
                      }}
                    >
                      <option value="">▼ 既存商品から選ぶ (翻訳不要)</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>

                    <div className="grid grid-cols-3 gap-2">
                      <select 
                        className={INPUT_STYLE}
                        value={slot.type || 'item'}
                        onChange={e => { const ns=[...featuredSlots]; ns[idx]={...ns[idx], type: e.target.value}; setFeaturedSlots(ns); }}
                      >
                        <option value="item">商品</option>
                        <option value="event">イベント</option>
                      </select>
                      <input value={slot.price || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].price=e.target.value; setFeaturedSlots(ns)}} placeholder="価格/期間" className={INPUT_STYLE} />
                    </div>

                    <input value={slot.name || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].name=e.target.value; setFeaturedSlots(ns)}} placeholder="タイトル" className={INPUT_STYLE} />
                    <textarea value={slot.desc || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].desc=e.target.value; setFeaturedSlots(ns)}} placeholder="説明文" className={`${INPUT_STYLE} h-20`} />
                    
                    <div className="flex gap-2">
                        <select value={slot.category || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].category=e.target.value; setFeaturedSlots(ns)}} className={INPUT_STYLE}>
                            <option value="">カテゴリ選択</option>
                            {displayCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <select value={slot.menuType || "grand"} onChange={e => {const ns=[...featuredSlots]; ns[idx].menuType=e.target.value; setFeaturedSlots(ns)}} className={INPUT_STYLE}>
                          <option value="grand">定番</option>
                          <option value="seasonal">限定</option>
                        </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-8 animate-in fade-in">
            <div className={CARD_STYLE}>
              <h3 className="font-black text-orange-500 tracking-widest text-xs uppercase underline underline-offset-8 decoration-orange-500/30">General Settings</h3>
              <div className="space-y-5 pt-2">
                <div><label className="text-[10px] text-zinc-500 mb-1.5 block font-black uppercase">Grand Menu Tab Name</label><input value={tabSettings.grand?.jp || ""} onChange={e => setTabSettings({...tabSettings, grand: {...(tabSettings?.grand || {}), jp: e.target.value}})} className={INPUT_STYLE} /></div>
                <div><label className="text-[10px] text-zinc-500 mb-1.5 block font-black uppercase">Seasonal Menu Tab Name</label><input value={tabSettings.seasonal?.jp || ""} onChange={e => setTabSettings({...tabSettings, seasonal: {...(tabSettings?.seasonal || {}), jp: e.target.value}})} className={INPUT_STYLE} /></div>
              </div>
              <button onClick={saveGeneralSettings} disabled={isProcessing} className="w-full bg-white text-black font-black py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-transform mt-4">{isProcessing ? <Loader2 className="animate-spin" size={20}/> : <Save size={20} />} 全設定を保存・翻訳</button>
            </div>
            
            {/* Credit Button */}
            <div className="flex justify-center">
              <button onClick={() => setShowCreditModal(true)} className="text-[10px] text-zinc-500 hover:text-white transition-colors flex items-center gap-1 border border-zinc-800 px-4 py-2 rounded-full">
                <Info size={12}/> クレジット・利用規約
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 編集モーダル */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEditingItem(null)}>
          <div className="w-full max-w-lg bg-zinc-900 border-t sm:border border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-6 pb-12 sm:pb-8 space-y-6 shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-white/5"><h3 className="text-xs font-black tracking-widest text-white uppercase italic">Product Edit</h3><button onClick={() => setEditingItem(null)} className="p-2 bg-white/5 rounded-full text-zinc-500 active:scale-75 transition-transform"><X size={20}/></button></div>
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="w-28 h-28 bg-zinc-950 rounded-2xl border border-zinc-700 flex items-center justify-center relative overflow-hidden group">
                  {editingItem.image ? <img src={editingItem.image} className="w-full h-full object-cover" /> : <Camera size={24} className="text-zinc-700"/>}
                  <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleImageUpload(e, (b64) => setEditingItem({...editingItem, image: b64}))} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 text-[10px] text-center py-1 text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity">CHANGE</div>
                </div>
                <div className="flex-1 space-y-3">
                  <input value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className={INPUT_STYLE} placeholder="名前" />
                  <input value={editingItem.price} onChange={e => setEditingItem({...editingItem, price: e.target.value})} className={INPUT_STYLE} placeholder="価格" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="text-[10px] text-zinc-500 block mb-1 font-black">種別</label>
                  <select value={editingItem.type} onChange={e => setEditingItem({...editingItem, type: e.target.value as any, category: ""})} className={INPUT_STYLE + " appearance-none"}>
                    <option value="grand">定番</option><option value="seasonal">限定</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 bottom-3.5 text-zinc-600 pointer-events-none" />
                </div>
                <div className="relative">
                  <label className="text-[10px] text-zinc-500 block mb-1 font-black">カテゴリ</label>
                  <select value={editingItem.category} onChange={e => setEditingItem({...editingItem, category: e.target.value})} className={INPUT_STYLE + " appearance-none"}>
                    <option value="">未選択</option>
                    {categoryList.filter(c => c.type === editingItem.type).map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 bottom-3.5 text-zinc-600 pointer-events-none" />
                </div>
              </div>
              <textarea value={editingItem.desc} onChange={e => setEditingItem({...editingItem, desc: e.target.value})} className={INPUT_STYLE + " h-28"} placeholder="説明文" />
              
              <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer ${editingItem.isSoldOut ? 'bg-red-500/20 border-red-500' : 'bg-black border-zinc-700'}`}>
                  <input type="checkbox" className="hidden" checked={editingItem.isSoldOut || false} onChange={e => setEditingItem({...editingItem, isSoldOut: e.target.checked})} />
                  <Ban size={16} className={editingItem.isSoldOut ? "text-red-500" : "text-zinc-500"} />
                  <span className={`text-xs font-bold ${editingItem.isSoldOut ? "text-red-500" : "text-zinc-500"}`}>{editingItem.isSoldOut ? "現在完売中" : "販売中"}</span>
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={saveEditedItem} className="flex-1 bg-white text-black font-black py-4 rounded-2xl active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-xl shadow-black/20"><Save size={18}/> 上書き</button>
                <button onClick={reTranslateAndSaveItem} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl active:scale-95 transition-transform flex justify-center items-center gap-2 shadow-xl shadow-blue-900/20"><Globe size={18}/> 翻訳更新</button>
              </div>
              <button onClick={() => deleteItem(editingItem.id)} className="w-full text-red-500 text-xs font-bold py-2 hover:underline flex justify-center items-center gap-1"><Trash2 size={12}/> この商品を完全に削除</button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-[150] bg-black/95 backdrop-blur-md flex items-center justify-center p-6" onClick={() => setShowCreditModal(false)}>
          <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-8 space-y-6 shadow-2xl max-h-[80vh] overflow-y-auto animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center border-b border-white/10 pb-4">
              <h2 className="text-lg font-black text-white tracking-widest">CREDIT & TERMS</h2>
              <button onClick={() => setShowCreditModal(false)}><X className="text-zinc-500 hover:text-white" /></button>
            </div>
            <div className="space-y-6 text-xs text-zinc-400 leading-relaxed font-serif">
              <div className="space-y-2">
                <h3 className="text-white font-bold border-l-2 border-orange-500 pl-2">基本情報</h3>
                <p>アプリ名：MOCKTERIA</p>
                <p>製造年月日：2026年1月20日</p>
                <p>開発者：PLANT FIELDS 植田 太雅</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-white font-bold border-l-2 border-orange-500 pl-2">保守・メンテナンス</h3>
                <p>無償メンテナンス期間：2026年1月20日より5年間（2031年1月19日まで）</p>
                <p>無償範囲：本アプリに関するデバッグ全般、デザインの軽微な変更・修正。</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-white font-bold border-l-2 border-orange-500 pl-2">有償メンテナンス規定</h3>
                <ul className="list-disc pl-4 space-y-1">
                  <li>簡易的な機能追加：時間単価 3,000円（予定実働時間にて請求）</li>
                  <li>高度なバックエンド業務（外部API接続等）：時間単価 6,000円（予定実働時間にて請求）</li>
                </ul>
                <p className="text-orange-500 mt-1">※製作者都合による納期遅延に関してはご請求いたしません。</p>
              </div>

              <div className="space-y-2">
                <h3 className="text-white font-bold border-l-2 border-orange-500 pl-2">クラウド利用に関する承諾事項</h3>
                <p>本アプリはクラウド開発プラットフォーム等（Vercel, Firebase等）を利用して稼働しています。</p>
                <p>原則として無料枠の範囲内での運用を前提としていますが、アクセス数の急増等に伴い有料プランへの移行が必要となった場合、そのランニングコストは依頼者の負担となることを予め承諾するものとします。</p>
              </div>

              <div className="space-y-2 pt-4 border-t border-white/10">
                <h3 className="text-white font-bold">著作権について</h3>
                <p>本アプリケーションの著作権は、PLANT FIELDS 植田 太雅に帰属します。</p>
                <p className="text-red-400">許可なき再配布、複製、販売は固く禁じます。万が一そのような行為が発覚した場合は、損害賠償請求の対象となります。</p>
              </div>
            </div>
            <div className="pt-4 text-center">
              <p className="text-[10px] text-zinc-600">© 2026 PLANT FIELDS / Taiga Ueda. All rights reserved.</p>
            </div>
          </div>
        </div>
      )}

      {/* ボトムナビ */}
      <nav className="fixed bottom-0 w-full bg-zinc-950/90 backdrop-blur-2xl border-t border-white/5 flex justify-around pt-3 pb-8 z-[60]">
        <button onClick={() => { setActiveTab('items'); exitSorting(); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'items' ? 'text-orange-500 scale-110' : 'text-zinc-600'}`}><Coffee size={24} strokeWidth={activeTab === 'items' ? 2.5 : 1.5}/><span className="text-[9px] font-black uppercase tracking-widest">Items</span></button>
        <button onClick={() => { setActiveTab('categories'); setIsCatSorting(false); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'categories' ? 'text-orange-500 scale-110' : 'text-zinc-600'}`}><Layers size={24} strokeWidth={activeTab === 'categories' ? 2.5 : 1.5}/><span className="text-[9px] font-black uppercase tracking-widest">Cat</span></button>
        <button onClick={() => { setActiveTab('header'); exitSorting(); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'header' ? 'text-orange-500 scale-110' : 'text-zinc-600'}`}><LayoutTemplate size={24} strokeWidth={activeTab === 'header' ? 2.5 : 1.5}/><span className="text-[9px] font-black uppercase tracking-widest">Head</span></button>
        <button onClick={() => { setActiveTab('settings'); exitSorting(); }} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-orange-500 scale-110' : 'text-zinc-600'}`}><Settings size={24} strokeWidth={activeTab === 'settings' ? 2.5 : 1.5}/><span className="text-[9px] font-black uppercase tracking-widest">Set</span></button>
      </nav>
    </div>
  );
}