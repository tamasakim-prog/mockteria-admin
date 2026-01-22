import { useState, useEffect, useMemo } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { Plus, Trash2, Loader2, Settings, LayoutTemplate, Coffee, Camera, ArrowUp, ArrowDown, Move, ArrowLeft, CheckCircle2, ListFilter, Edit3, X, Eye, Ban, Layers, Lock, Unlock, AlertTriangle, Info, Search, Star } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc, setDoc, onSnapshot } from "firebase/firestore";

// --- Config ---
const TRANSLATE_API_URL = "https://us-central1-mockteria-757c7.cloudfunctions.net/translate"; 
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

const LANGUAGES = [{code:'en',target:'EN-US'},{code:'fr',target:'FR'},{code:'it',target:'IT'},{code:'de',target:'DE'},{code:'ko',target:'KO'},{code:'zh',target:'ZH'}];
type MenuType = 'grand' | 'seasonal';
const INPUT_STYLE = "w-full bg-zinc-950 border border-zinc-600 rounded-xl p-3 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none transition-all shadow-inner";
const CARD_STYLE = "bg-zinc-900 p-5 rounded-3xl border border-zinc-700/50 space-y-4 shadow-xl";

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
  const [items, setItems] = useState<any[]>([]);
  const [categoryList, setCategoryList] = useState<{name: string, type: MenuType}[]>([]);
  const [featuredSlots, setFeaturedSlots] = useState<any[]>(Array(5).fill({}));
  const [tabSettings, setTabSettings] = useState<any>({ grand: { jp: "" }, seasonal: { jp: "" } });
  const [splashSettings, setSplashSettings] = useState<any>({});
  
  const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'header' | 'settings'>(() => {
      const saved = localStorage.getItem('mockteria_activeTab');
      return (saved === 'categories' || saved === 'header' || saved === 'settings') ? saved : 'items';
  });

  useEffect(() => {
      localStorage.setItem('mockteria_activeTab', activeTab);
  }, [activeTab]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [sortPhase, setSortPhase] = useState<'none' | 'select_category' | 'sorting'>('none');
  const [targetCategory, setTargetCategory] = useState<string>("");
  const [sortingItems, setSortingItems] = useState<any[]>([]);
  
  const [isCatSorting, setIsCatSorting] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState<string>("");
  const [isGrandLocked, setIsGrandLocked] = useState(true);

  const [nameWarning, setNameWarning] = useState<string | null>(null);
  const [catWarning, setCatWarning] = useState<string | null>(null);

  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState<MenuType>('seasonal');
  const [newItemName, setNewItemName] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [newItemType, setNewItemType] = useState<MenuType>("seasonal");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemImage, setNewItemImage] = useState("");

  // データ同期
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "menuData"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        const loadedItems = data.items || [];
        setItems(loadedItems);
        setFeaturedSlots(data.featuredSlots || Array(5).fill({}));
        setTabSettings(data.tabSettings || { grand: { jp: "定番メニュー" }, seasonal: { jp: "限定メニュー" } });
        setSplashSettings(data.splashSettings || {});
        
        let rawCats = data.categoryList || [];
        
        // カテゴリ自動復旧
        if ( (!rawCats || rawCats.length === 0) && loadedItems.length > 0 ) {
            console.warn("⚠️カテゴリ消失を検知: 自動復旧します");
            const uniqueCatNames = [...new Set(loadedItems.map((i:any) => i.category))];
            rawCats = uniqueCatNames.map(name => {
                const sampleItem = loadedItems.find((i:any) => i.category === name);
                return { name: name, type: sampleItem?.type || 'grand' };
            });
        }

        if (Array.isArray(rawCats)) {
            const safeCats = rawCats.map((c: any) => {
                if (typeof c === 'string') return { name: c, type: 'grand' };
                if (c && typeof c === 'object') return { name: c.name || "Unknown", type: c.type || 'grand' };
                return null;
            }).filter(Boolean) as any;
            
            // 並び替え中・編集中以外は更新を受け入れる
            if (!isCatSorting && !editingCatId && !isProcessing && sortPhase === 'none') {
                setCategoryList(safeCats);
            }
        }
      }
    });
    return () => unsub();
  }, [isCatSorting, editingCatId, isProcessing, sortPhase]);

  useEffect(() => {
    if (isGrandLocked) { setNewItemType('seasonal'); setNewCatType('seasonal'); }
  }, [isGrandLocked]);

  useEffect(() => {
    if (!newItemName) { setNameWarning(null); return; }
    const similarItem = items.find(i => calculateSimilarity(i.name, newItemName) > 0.85);
    if (similarItem) setNameWarning(similarItem.name === newItemName ? `⚠️ 登録済み: ${similarItem.name}` : `⚠️ 類似: ${similarItem.name}`);
    else setNameWarning(null);
  }, [newItemName, items]);

  useEffect(() => {
    if (!newCatName) { setCatWarning(null); return; }
    const similarCat = categoryList.find(c => calculateSimilarity(c.name, newCatName) > 0.85);
    if (similarCat) setCatWarning(similarCat.name === newCatName ? `⚠️ 登録済み` : `⚠️ 類似あり`);
    else setCatWarning(null);
  }, [newCatName, categoryList]);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    return items.filter(item => {
        const targetString = `${item.name} ${item.desc} ${item.price} ${item.category}`;
        return calculateSimilarity(targetString, searchQuery) > 0.3;
    });
  }, [items, searchQuery]);

  const filteredCategoryList = useMemo(() => categoryList.filter(c => c.type === newItemType), [categoryList, newItemType]);

  const displayCategories = categoryList.map(c => c?.name || "Unknown");

  const translateTexts = async (texts: string[], targetLang: string) => {
    try {
      const response = await fetch(TRANSLATE_API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texts, target_lang: targetLang })
      });
      if (!response.ok) return texts;
      const data = await response.json();
      return data.translations.map((t: any) => t.text);
    } catch (e) { return texts; }
  };

  const handleImageUpload = async (e: any, callback: (url: string) => void) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    setTimeout(() => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const scale = 800 / img.width;
            canvas.width = 800; canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(async (blob) => {
                if (!blob) { setUploading(false); return; }
                try {
                    const refName = `menu-images/${Date.now()}-${file.name}`;
                    const r = ref(storage, refName);
                    await uploadBytes(r, blob);
                    callback(await getDownloadURL(r));
                } catch (e) { alert("画像エラー"); } finally { setUploading(false); }
            }, 'image/jpeg', 0.8);
          };
          img.src = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, 100);
  };

  // --- Core Actions ---
  
  const saveAndReload = async (data: any, msg: string) => {
      setIsProcessing(true);
      try {
          await updateDoc(doc(db, "settings", "menuData"), { ...data, updatedAt: new Date() });
          alert(msg);
          window.location.reload();
      } catch (e: any) {
          console.error(e);
          alert("エラーが発生しました: " + e.message);
          setIsProcessing(false);
      }
  };

  const addCategory = async () => {
    if (!newCatName) return;
    const newList = [...categoryList, { name: newCatName, type: newCatType }];
    await saveAndReload({ categoryList: newList }, "カテゴリを追加しました");
  };

  const executeCategoryUpdate = async (oldName: string, newName: string, type: MenuType) => {
      setIsProcessing(true);
      try {
        const translations: any = {};
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
        await saveAndReload({ categoryList: newList, items: newItems }, "更新しました");
      } catch(e) { alert("翻訳エラー"); setIsProcessing(false); }
  };

  const deleteCategory = async (catName: string) => {
    if (!confirm("削除しますか？")) return;
    const newList = categoryList.filter(c => c.name !== catName);
    await saveAndReload({ categoryList: newList }, "削除しました");
  };

  const moveCategory = (currentIndex: number, direction: 'up' | 'down') => {
    const list = [...categoryList];
    const targetType = list[currentIndex].type;
    let swapIndex = -1;
    if (direction === 'up') {
        for (let i = currentIndex - 1; i >= 0; i--) if (list[i].type === targetType) { swapIndex = i; break; }
    } else {
        for (let i = currentIndex + 1; i < list.length; i++) if (list[i].type === targetType) { swapIndex = i; break; }
    }
    if (swapIndex !== -1) {
        [list[currentIndex], list[swapIndex]] = [list[swapIndex], list[currentIndex]];
        setCategoryList(list);
    }
  };

  const saveCategoryOrder = async () => {
      await saveAndReload({ categoryList }, "並び順を保存しました");
  };

  // --- Item Sorting ---
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
    exitSorting(); alert("商品の並び順を保存しました");
  };

  // --- Item Actions ---
  const createNewItem = async () => {
    if (!newItemName) return alert("名前を入力してください");
    setIsProcessing(true);
    const trans: any = {};
    for (const l of LANGUAGES) {
        const res = await translateTexts([newItemName, newItemDesc, newItemCategory], l.target);
        trans[l.code] = { name: res[0], desc: res[1], category: res[2] };
    }
    const newItem = {
      id: `id-${Date.now()}`, name: newItemName, desc: newItemDesc, price: newItemPrice, image: newItemImage, category: newItemCategory, type: newItemType, isSoldOut: false, translations: trans
    };
    await setDoc(doc(db, "settings", "menuData"), { items: [...items, newItem], updatedAt: new Date() }, { merge: true });
    setNewItemName(""); setNewItemDesc(""); setNewItemPrice(""); setNewItemImage(""); setShowItemForm(false); setIsProcessing(false);
    alert("登録しました");
  };

  const deleteItem = async (itemId: string) => {
      if(!confirm("削除しますか？")) return;
      const target = items.find(i => i.id === itemId);
      if (target?.image?.startsWith('http')) deleteObject(ref(storage, target.image)).catch(()=>{});
      const newItems = items.filter(i => i.id !== itemId);
      await setDoc(doc(db, "settings", "menuData"), { items: newItems, updatedAt: new Date() }, { merge: true });
      alert("削除しました");
  };

  const toggleSoldOut = async (item: any) => {
    const newItems = items.map(i => i.id === item.id ? { ...i, isSoldOut: !i.isSoldOut } : i);
    await setDoc(doc(db, "settings", "menuData"), { items: newItems }, { merge: true });
  };

  const saveEditedItem = async () => {
    if (!editingItem) return;
    const newItems = items.map(i => i.id === editingItem.id ? editingItem : i);
    await setDoc(doc(db, "settings", "menuData"), { items: newItems }, { merge: true });
    setEditingItem(null); alert("保存しました");
  };

  const reTranslateAndSaveItem = async () => {
    if (!editingItem) return;
    if (!confirm("再翻訳しますか？")) return;
    setIsProcessing(true);
    const translations: any = {};
    for (const lang of LANGUAGES) {
        const results = await translateTexts([editingItem.name, editingItem.desc, editingItem.category], lang.target);
        translations[lang.code] = { name: results[0], desc: results[1], category: results[2] };
    }
    const updatedItem = { ...editingItem, translations, categoryEnglish: translations['en']?.category || editingItem.category };
    const newItems = items.map(i => i.id === editingItem.id ? updatedItem : i);
    await setDoc(doc(db, "settings", "menuData"), { items: newItems }, { merge: true });
    setEditingItem(null); setIsProcessing(false); alert("翻訳更新しました");
  };

  const saveToFirebase = async (payload: any) => {
    setIsProcessing(true);
    try { 
        await setDoc(doc(db, "settings", "menuData"), { ...payload, updatedAt: new Date() }, { merge: true }); 
    } catch (e: any) { 
        console.error(e);
        alert("保存エラー"); 
    } finally { setIsProcessing(false); }
  };

  const saveFeaturedSettings = async () => {
    setIsProcessing(true);
    await setDoc(doc(db, "settings", "menuData"), { featuredSlots, updatedAt: new Date() }, { merge: true });
    setIsProcessing(false); alert("保存しました");
  };

  const saveGeneralSettings = async () => {
    setIsProcessing(true);
    await setDoc(doc(db, "settings", "menuData"), { tabSettings, splashSettings, updatedAt: new Date() }, { merge: true });
    setIsProcessing(false); alert("保存しました");
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-black text-white tracking-[0.2em] font-['Shippori_Mincho']">MOCKTERIA</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsGrandLocked(!isGrandLocked)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isGrandLocked ? 'bg-zinc-800 text-zinc-400' : 'bg-orange-500 text-black'}`}>
            {isGrandLocked ? <Lock size={14}/> : <Unlock size={14}/>} {isGrandLocked ? 'Lock' : 'Unlock'}
          </button>
          <a href={PREVIEW_URL} target="_blank" className="bg-zinc-800 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Eye size={14}/> Preview</a>
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {activeTab === 'items' && (
          <div className="space-y-6">
            <div className="flex justify-end h-10">
              {/* 商品並び替えボタン */}
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
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-orange-500 outline-none" />
                </div>
            )}

            {sortPhase === 'none' && (
              <>
                {!showItemForm && !searchQuery ? (
                    <button onClick={() => setShowItemForm(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-400 font-bold flex items-center justify-center gap-2 hover:bg-zinc-900"><Plus size={20}/> Add New Item</button>
                ) : showItemForm && (
                    <div className={CARD_STYLE}>
                        <div className="flex justify-between items-center"><span className="font-bold text-sm text-orange-500">新規商品登録</span><button onClick={() => setShowItemForm(false)}><X size={20}/></button></div>
                        <div className="flex gap-4">
                            <div className="w-24 h-24 bg-zinc-950 rounded-2xl border border-zinc-700 flex items-center justify-center relative overflow-hidden">
                                {uploading ? <Loader2 className="animate-spin text-orange-500" /> : (newItemImage ? <img src={newItemImage} className="w-full h-full object-cover" /> : <Camera className="text-zinc-600" />)}
                                <input type="file" className="absolute inset-0 opacity-0" onChange={e => handleImageUpload(e, setNewItemImage)} />
                            </div>
                            <div className="flex-1 space-y-3">
                                <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Name" className={INPUT_STYLE} />
                                <input value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} placeholder="Price" className={INPUT_STYLE} />
                            </div>
                        </div>
                        {nameWarning && <div className="text-amber-500 text-xs">{nameWarning}</div>}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <select value={newItemType} onChange={e => setNewItemType(e.target.value as any)} className={INPUT_STYLE} disabled={isGrandLocked}><option value="seasonal">Seasonal</option><option value="grand">Grand</option></select>
                            <select value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)} className={INPUT_STYLE}><option value="">Category...</option>{filteredCategoryList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
                        </div>
                        <textarea value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="Description" className={`${INPUT_STYLE} h-24`} />
                        <button onClick={createNewItem} disabled={isProcessing} className="w-full bg-orange-500 text-black font-bold py-4 rounded-2xl">翻訳して登録</button>
                    </div>
                )}

                <div className="space-y-8 pt-4">
                    {['seasonal', 'grand'].map(type => (
                        <div key={type} className={`border-l-4 pl-4 ${type === 'grand' ? 'border-blue-500' : 'border-green-500'}`}>
                            <h3 className="text-sm font-black mb-4 uppercase tracking-widest">{type} MENU</h3>
                            {categoryList.filter(c => c.type === type).map(cat => (
                                <div key={cat.name} className="mb-6">
                                    <h4 className="text-xs text-zinc-500 mb-2 font-bold px-1">{cat.name}</h4>
                                    <div className="space-y-2">
                                        {filteredItems.filter(i => i.category === cat.name).map(item => (
                                            <div key={item.id} className="bg-zinc-900 p-3 rounded-2xl border border-zinc-700 flex gap-3 items-center">
                                                <div className="w-12 h-12 bg-black rounded-xl overflow-hidden shrink-0">
                                                  {item.image ? (
                                                    <img src={item.image} className={`w-full h-full object-cover ${item.isSoldOut ? 'opacity-40 grayscale' : ''}`} />
                                                  ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-zinc-700"><Camera size={16}/></div>
                                                  )}
                                                </div>
                                                <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{item.name}</div><div className="text-[10px] text-zinc-500">¥{item.price}</div></div>
                                                <button onClick={() => toggleSoldOut(item)} className={`p-2 rounded-xl ${item.isSoldOut ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}><Ban size={16}/></button>
                                                <button onClick={() => setEditingItem({...item})} className="p-2 rounded-xl bg-zinc-800 text-white" disabled={isGrandLocked && type === 'grand' && !item.isSoldOut}><Edit3 size={16}/></button>
                                                <button onClick={() => deleteItem(item.id)} className="p-2 rounded-xl bg-zinc-800 text-red-500" disabled={isGrandLocked && type === 'grand'}><Trash2 size={16}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
              </>
            )}

            {/* カテゴリ選択モード */}
            {sortPhase === 'select_category' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pt-4">
                <div className="text-center space-y-2 mb-8"><ListFilter className="mx-auto text-orange-500" size={32} /><h2 className="text-lg font-bold">並び替えるカテゴリを選択</h2></div>
                
                {/* Seasonal */}
                <div className="space-y-3">
                    <h3 className="text-xs font-black text-green-500 uppercase tracking-widest pl-1">Seasonal</h3>
                    <div className="grid gap-3">
                        {categoryList.filter(c => c.type === 'seasonal').map(cat => (
                            <button key={cat.name} onClick={() => selectCategoryToSort(cat.name)} className="w-full bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left flex justify-between items-center active:scale-95 transition-transform hover:border-orange-500/50">
                                <div className="flex flex-col"><span className="font-bold text-sm">{cat.name}</span></div>
                                <span className="text-xs bg-black/50 px-3 py-1 rounded-full text-zinc-400">{items.filter(i => i.category === cat.name).length} items</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grand */}
                <div className="space-y-3">
                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest pl-1">Grand Menu</h3>
                    <div className="grid gap-3">
                        {categoryList.filter(c => c.type === 'grand').map(cat => (
                            <button key={cat.name} onClick={() => selectCategoryToSort(cat.name)} className="w-full bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left flex justify-between items-center active:scale-95 transition-transform hover:border-orange-500/50">
                                <div className="flex flex-col"><span className="font-bold text-sm">{cat.name}</span></div>
                                <span className="text-xs bg-black/50 px-3 py-1 rounded-full text-zinc-400">{items.filter(i => i.category === cat.name).length} items</span>
                            </button>
                        ))}
                    </div>
                </div>
              </div>
            )}

            {/* 商品並び替えモード */}
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
          <div className="space-y-6 pb-20">
            <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/10">
              <h2 className="font-bold flex items-center gap-2 text-zinc-200"><Layers size={20} className="text-orange-500" /> カテゴリ管理</h2>
              <button onClick={() => isCatSorting ? saveCategoryOrder() : setIsCatSorting(true)} className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm ${isCatSorting ? 'bg-orange-500 text-black' : 'bg-zinc-800 text-zinc-400'}`}>
                {isCatSorting ? <CheckCircle2 size={16} /> : <ArrowUp size={16} />} {isCatSorting ? '保存' : '並び替え'}
              </button>
            </div>

            {!isCatSorting && !showCatForm && <button onClick={() => setShowCatForm(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-400 font-bold flex items-center justify-center gap-2"><Plus size={20}/> Add Category</button>}
            
            {showCatForm && (
                <div className={CARD_STYLE}>
                    <div className="flex justify-between items-center"><h3 className="font-bold text-orange-500 text-sm">カテゴリ追加</h3><button onClick={() => setShowCatForm(false)}><X size={20}/></button></div>
                    {catWarning && <div className="text-amber-500 text-xs">{catWarning}</div>}
                    <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Category Name" className={INPUT_STYLE} />
                    <div className="flex gap-2 pt-2">
                        <button onClick={() => !isGrandLocked && setNewCatType('grand')} className={`flex-1 py-3 rounded-xl text-xs font-bold ${newCatType==='grand'?'bg-blue-600':'bg-zinc-800'} ${isGrandLocked ? 'opacity-50':''}`}>Grand</button>
                        <button onClick={() => setNewCatType('seasonal')} className={`flex-1 py-3 rounded-xl text-xs font-bold ${newCatType==='seasonal'?'bg-green-600':'bg-zinc-800'}`}>Seasonal</button>
                    </div>
                    <button onClick={addCategory} className="w-full bg-white text-black font-black py-4 rounded-2xl mt-4">追加</button>
                </div>
            )}

            <div className="space-y-4">
                {['seasonal', 'grand'].map(type => (
                    <div key={type} className="bg-zinc-900/60 p-4 rounded-2xl border border-white/5">
                        <h3 className={`text-xs font-black tracking-widest mb-3 uppercase flex items-center gap-2 ${type==='grand'?'text-blue-500':'text-green-500'}`}>{type}</h3>
                        <div className="space-y-2">
                            {categoryList.map((cat, idx) => {
                                if (cat.type !== type) return null;
                                return (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-zinc-700">
                                        <div className="flex-1">
                                            {editingCatId === cat.name ? (
                                                <div className="flex gap-2">
                                                    <input value={editingCatName} onChange={e => setEditingCatName(e.target.value)} className="bg-black border border-zinc-600 rounded px-2 py-1 text-white w-full" />
                                                    <button onClick={() => executeCategoryUpdate(cat.name, editingCatName, cat.type)} className="bg-green-600 px-3 rounded"><CheckCircle2 size={16}/></button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-between items-center w-full">
                                                    <span className="font-bold text-zinc-300">{cat.name}</span>
                                                    {!isCatSorting && (
                                                        <div className="flex gap-2">
                                                            <button onClick={() => { setEditingCatId(cat.name); setEditingCatName(cat.name); }} className="text-zinc-500 hover:text-white"><Edit3 size={16}/></button>
                                                            <button onClick={() => deleteCategory(cat.name)} className="text-zinc-500 hover:text-red-500"><Trash2 size={16}/></button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {isCatSorting && (
                                            <div className="flex gap-1 ml-2">
                                                <button onClick={() => moveCategory(idx, 'up')} className="p-2 bg-black rounded text-zinc-400 hover:text-white"><ArrowUp size={16}/></button>
                                                <button onClick={() => moveCategory(idx, 'down')} className="p-2 bg-black rounded text-zinc-400 hover:text-white"><ArrowDown size={16}/></button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
          </div>
        )}

        {/* Header Tab */}
        {activeTab === 'header' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-700/50">
              <span className="font-bold text-sm">Header Settings</span>
              <button onClick={saveFeaturedSettings} disabled={isProcessing} className="bg-white text-black px-4 py-2 rounded-lg text-xs font-bold">Save</button>
            </div>
            {featuredSlots.map((slot, idx) => (
                <div key={idx} className={CARD_STYLE}>
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 mb-2">
                        <span>SLOT {idx+1}</span>
                        {!slot.itemId && <span className="text-orange-500 flex items-center gap-1"><AlertTriangle size={10}/> 未設定</span>}
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
                    <input value={slot.name || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].name=e.target.value; setFeaturedSlots(ns)}} placeholder="Title" className={`${INPUT_STYLE} mt-2`} />
                    <textarea value={slot.desc || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].desc=e.target.value; setFeaturedSlots(ns)}} placeholder="Desc" className={`${INPUT_STYLE} mt-2 h-20`} />
                    <select value={slot.category || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].category=e.target.value; setFeaturedSlots(ns)}} className={`${INPUT_STYLE} mt-2`}>
                        <option value="">Category...</option>
                        {displayCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>
            ))}
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-8">
            <div className={CARD_STYLE}>
              <h3 className="font-bold text-orange-500 text-xs mb-4">GENERAL</h3>
              <div className="flex items-center gap-2 mb-2 text-zinc-400 text-xs"><Star size={12}/> Grand Menu Title</div>
              <input value={tabSettings.grand?.jp || ""} onChange={e => setTabSettings({...tabSettings, grand: {...(tabSettings?.grand || {}), jp: e.target.value}})} className={INPUT_STYLE} />
              
              <div className="flex items-center gap-2 mt-4 mb-2 text-zinc-400 text-xs"><Info size={12}/> Seasonal Menu Title</div>
              <input value={tabSettings.seasonal?.jp || ""} onChange={e => setTabSettings({...tabSettings, seasonal: {...(tabSettings?.seasonal || {}), jp: e.target.value}})} className={INPUT_STYLE} />

              <button onClick={saveGeneralSettings} disabled={isProcessing} className="w-full bg-white text-black font-black py-4 rounded-2xl mt-6">全設定保存</button>
            </div>
            <div className="text-center"><button onClick={() => setShowCreditModal(true)} className="text-xs text-zinc-600"><Info size={12} className="inline"/> Info</button></div>
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-zinc-900 rounded-3xl p-6 space-y-4 border border-zinc-700">
                <div className="flex justify-between"><h3 className="font-bold">Edit Item</h3><button onClick={() => setEditingItem(null)}><X/></button></div>
                <div className="flex gap-4">
                    <div className="w-20 h-20 bg-black rounded flex items-center justify-center relative overflow-hidden border border-zinc-700">
                        {/* 画像があれば表示、なければAdd文字（カメラアイコンは一覧用） */}
                        {editingItem.image ? (
                            <img src={editingItem.image} className="w-full h-full object-cover"/>
                        ) : (
                            <span className="text-[10px] text-zinc-600">Add</span>
                        )}
                        <input type="file" className="absolute inset-0 opacity-0" onChange={e => handleImageUpload(e, (url) => setEditingItem({...editingItem, image: url}))}/>
                    </div>
                    <div className="flex-1 space-y-2">
                        <input value={editingItem.name} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className={INPUT_STYLE} />
                        <input value={editingItem.price} onChange={e => setEditingItem({...editingItem, price: e.target.value})} className={INPUT_STYLE} />
                    </div>
                </div>
                <textarea value={editingItem.desc} onChange={e => setEditingItem({...editingItem, desc: e.target.value})} className={`${INPUT_STYLE} h-24`} />
                <div className="flex gap-2">
                    <button onClick={saveEditedItem} className="flex-1 bg-white text-black py-3 rounded-xl font-bold">Save</button>
                    <button onClick={reTranslateAndSaveItem} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold">Translate</button>
                </div>
                <button onClick={() => deleteItem(editingItem.id)} className="w-full text-red-500 py-2 text-xs">Delete Item</button>
            </div>
        </div>
      )}

      {/* Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-6" onClick={() => setShowCreditModal(false)}>
            <div className="bg-zinc-900 p-8 rounded-3xl max-w-sm text-xs text-zinc-400 space-y-4">
                <h2 className="text-white font-bold text-lg">MOCKTERIA</h2>
                <p>Version 2026.1.22</p>
                <p>Dev: PLANT FIELDS</p>
            </div>
        </div>
      )}

      <nav className="fixed bottom-0 w-full bg-zinc-950/90 border-t border-zinc-800 flex justify-around pt-3 pb-8 z-[60]">
        <button onClick={() => setActiveTab('items')} className={`flex flex-col items-center ${activeTab==='items'?'text-orange-500':'text-zinc-600'}`}><Coffee/><span className="text-[9px] font-bold">Items</span></button>
        <button onClick={() => { setActiveTab('categories'); setIsCatSorting(false); }} className={`flex flex-col items-center ${activeTab==='categories'?'text-orange-500':'text-zinc-600'}`}><Layers/><span className="text-[9px] font-bold">Cat</span></button>
        <button onClick={() => setActiveTab('header')} className={`flex flex-col items-center ${activeTab==='header'?'text-orange-500':'text-zinc-600'}`}><LayoutTemplate/><span className="text-[9px] font-bold">Head</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center ${activeTab==='settings'?'text-orange-500':'text-zinc-600'}`}><Settings/><span className="text-[9px] font-bold">Set</span></button>
      </nav>
    </div>
  );
}