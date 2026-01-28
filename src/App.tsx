import { useState, useEffect, useMemo } from 'react';
import { Save, Plus, Trash2, RefreshCw, Loader2, Settings, LayoutTemplate, Coffee, Camera, ChevronDown, ArrowUp, ArrowDown, Move, ArrowLeft, CheckCircle2, Edit3, X, Eye, Ban, Layers, Lock, Unlock, AlertTriangle, Info, Search } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

// --- Config ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// ★★★ ここに Firebase Functions の URL を貼り付けてください ★★★
// 例: "https://us-central1-mockteria-757c7.cloudfunctions.net/translate"
// ※ わからない場合は firebase functions:list コマンドで確認できます
const TRANSLATE_API_URL = "https://us-central1-mockteria-757c7.cloudfunctions.net/translate"; // ← ここを書き換える！！

const PREVIEW_URL = "https://mockteria-757c7.web.app";

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

// Styles
const INPUT_STYLE = "w-full bg-zinc-950 border border-zinc-600 rounded-xl p-3 text-sm text-white placeholder-zinc-500 focus:border-orange-500 focus:outline-none transition-all shadow-inner";
const CARD_STYLE = "bg-zinc-900 p-5 rounded-3xl border border-zinc-700/50 space-y-4 shadow-xl";

// Similarity Check
const calculateSimilarity = (s1: string, s2: string): number => {
  if (!s1 || !s2) return 0;
  const a = String(s1).toLowerCase().replace(/\s+/g, '');
  const b = String(s2).toLowerCase().replace(/\s+/g, '');
  if (a.includes(b) || b.includes(a)) return 1.0;
  return 0;
};

export default function AdminApp() {
  // Data
  const [items, setItems] = useState<any[]>([]);
  const [categoryList, setCategoryList] = useState<{name: string}[]>([]);
  const [featuredSlots, setFeaturedSlots] = useState<any[]>(Array(5).fill({}));
  const [tabSettings, setTabSettings] = useState<any>({ grand: { jp: "" }, seasonal: { jp: "" } });
  const [featuredLabel, setFeaturedLabel] = useState<any>({ jp: "今月のおすすめ" });
  
  // UI State
  const [activeTab, setActiveTab] = useState<'items' | 'categories' | 'header' | 'settings'>('items');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Sort & Edit
  const [sortPhase, setSortPhase] = useState<'none' | 'select_category' | 'sorting'>('none');
  const [targetCategory, setTargetCategory] = useState<string>("");
  const [sortingItems, setSortingItems] = useState<any[]>([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [isGrandLocked, setIsGrandLocked] = useState(true);

  // Category Edit
  const [showCatForm, setShowCatForm] = useState(false);
  const [isCatSorting, setIsCatSorting] = useState(false);
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [editCatNameInput, setEditCatNameInput] = useState("");

  // Warnings
  const [nameWarning, setNameWarning] = useState<string | null>(null);
  const [catWarning, setCatWarning] = useState<string | null>(null);

  // Inputs
  const [newCatName, setNewCatName] = useState("");
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
        if (!isProcessing && !editingItem && !editingCategoryName && !isCatSorting) {
            setItems(data.items || []);
            setFeaturedSlots(data.featuredSlots || Array(5).fill({}));
            setTabSettings(data.tabSettings || { grand: { jp: "定番メニュー" }, seasonal: { jp: "限定メニュー" } });
            
            let rawCats = data.categoryList || [];
            let safeCats: {name: string}[] = [];
            if (Array.isArray(rawCats)) {
                const uniqueNames = new Set<string>();
                rawCats.forEach((c: any) => {
                    const name = typeof c === 'string' ? c : c.name;
                    if (name && !uniqueNames.has(name)) {
                        uniqueNames.add(name);
                        safeCats.push({ name });
                    }
                });
            }
            setCategoryList(safeCats);
            setFeaturedLabel(data.featuredLabel || { jp: "今月のおすすめ" });
        }
      }
    });
    return () => unsub();
  }, [isProcessing, editingItem, editingCategoryName, isCatSorting]);

  // AI Check
  useEffect(() => {
    if (!newItemName) { setNameWarning(null); return; }
    const similarItem = items.find(i => calculateSimilarity(i.name||"", newItemName) > 0.85);
    if (similarItem) {
      setNameWarning(similarItem.name === newItemName ? `⚠️ 警告: 既に登録済みの可能性` : `⚠️ AI検知: 類似商品あり`);
    } else { setNameWarning(null); }
  }, [newItemName, items]);

  useEffect(() => {
    if (!newCatName) { setCatWarning(null); return; }
    const similarCat = categoryList.find(c => calculateSimilarity(c.name||"", newCatName) > 0.85);
    if (similarCat) {
      setCatWarning(similarCat.name === newCatName ? `⚠️ 既に存在するカテゴリです` : `⚠️ 類似カテゴリがあります`);
    } else { setCatWarning(null); }
  }, [newCatName, categoryList]);

  useEffect(() => {
    if (isGrandLocked) {
      setNewItemType('seasonal');
    }
  }, [isGrandLocked]);

  // API - 翻訳処理 (修正済み)
  const translateTexts = async (texts: string[], targetLang: string) => {
    try {
      // 指定されたURLへリクエストを送信
      const response = await fetch(TRANSLATE_API_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // provider: 'deepl' を付与して DeepL を使うことを明示
        body: JSON.stringify({ text: texts, target_lang: targetLang, provider: 'deepl' })
      });
      if (!response.ok) throw new Error("Translation API request failed");
      const data = await response.json();
      return data.translations.map((t: any) => t.text);
    } catch (e) { 
        console.error("Translation Error:", e);
        return texts; // 失敗時は原文を返す
    }
  };

  const saveToFirebase = async (payload: any, successMsg?: string) => {
    setIsProcessing(true);
    try { 
        const dataToSave = { ...payload, updatedAt: new Date() };
        if (activeTab === 'categories' && !payload.categoryList) {
             dataToSave.categoryList = categoryList;
        }
        await setDoc(doc(db, "settings", "menuData"), dataToSave, { merge: true }); 
        if (successMsg) window.alert(successMsg);
    }
    catch (e) { 
        console.error(e);
        window.alert("【保存エラー】\nデータの保存に失敗しました。");
        throw e;
    } 
    finally { setIsProcessing(false); }
  };

  // Storage Upload
  const handleImageUpload = async (e: any, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true); 
    try {
        const compressedFile = await new Promise<Blob>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1000;
                    const scale = MAX_WIDTH / Math.max(img.width, MAX_WIDTH);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        canvas.toBlob((blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error("Blob failed"));
                        }, 'image/jpeg', 0.8);
                    } else {
                        reject(new Error("Canvas context failed"));
                    }
                };
                img.onerror = (e) => reject(e);
                img.src = ev.target?.result as string;
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
        });

        const storageRef = ref(storage, `images/${Date.now()}_${file.name}`);
        await uploadBytes(storageRef, compressedFile);
        const downloadURL = await getDownloadURL(storageRef);
        callback(downloadURL);
        
    } catch (err) {
        console.error(err);
        window.alert("画像のアップロードに失敗しました。\nStorage設定を確認してください。");
    } finally {
        setIsProcessing(false);
    }
  };

  // --- Category Actions ---
  const addCategory = async () => {
    if (!newCatName) return;
    if (categoryList.some(c => c.name === newCatName)) return alert("既に同名のカテゴリが存在します");
    setIsProcessing(true);
    try {
        const newList = [...categoryList, { name: newCatName }];
        await saveToFirebase({ categoryList: newList }, "カテゴリを追加しました");
        setCategoryList(newList); setNewCatName(""); setShowCatForm(false);
    } catch(e) {} finally { setIsProcessing(false); }
  };

  const startEditingCategory = (name: string) => {
      setEditingCategoryName(name);
      setEditCatNameInput(name);
  };

  const executeCategoryUpdate = async () => {
      if (!editingCategoryName || !editCatNameInput) return;
      setIsProcessing(true);
      try {
        const oldName = editingCategoryName;
        const newName = editCatNameInput;
        const translations: any = {};
        await Promise.all(LANGUAGES.map(async (lang) => {
            const res = await translateTexts([newName], lang.target);
            translations[lang.code] = res[0];
        }));
        const newList = categoryList.map(c => c.name === oldName ? { name: newName } : c);
        const newItems = items.map(item => {
            if (item.category === oldName) {
                const newTrans = JSON.parse(JSON.stringify(item.translations || {}));
                LANGUAGES.forEach(l => { 
                    if (!newTrans[l.code]) newTrans[l.code] = {}; 
                    newTrans[l.code].category = translations[l.code]; 
                });
                return { ...item, category: newName, categoryEnglish: translations['en'], translations: newTrans };
            }
            return item;
        });
        await saveToFirebase({ categoryList: newList, items: newItems });
        setCategoryList(newList); setItems(newItems); setEditingCategoryName(null);
        alert("カテゴリ名を変更し、関連商品を更新しました");
      } catch (e) { 
          // error handled
      } finally { setIsProcessing(false); }
  };

  const deleteCategory = async (name: string) => {
    if (!confirm(`カテゴリ「${name}」を削除しますか？`)) return;
    setIsProcessing(true);
    try {
        const newList = categoryList.filter(c => c.name !== name);
        await saveToFirebase({ categoryList: newList }, "カテゴリを削除しました");
        setCategoryList(newList);
    } catch(e) {} finally { setIsProcessing(false); }
  };

  const moveCategory = (idx: number, dir: 'up' | 'down') => {
      const newList = [...categoryList];
      if (dir === 'up' && idx > 0) [newList[idx], newList[idx - 1]] = [newList[idx - 1], newList[idx]];
      if (dir === 'down' && idx < newList.length - 1) [newList[idx], newList[idx + 1]] = [newList[idx + 1], newList[idx]];
      setCategoryList(newList);
  };

  const saveCategoryOrder = async () => {
      setIsProcessing(true);
      try {
        await saveToFirebase({ categoryList });
        setIsCatSorting(false);
        alert("カテゴリ順序を保存しました");
      } catch(e) {} finally { setIsProcessing(false); }
  };

  // --- Item Actions ---
  const createNewItem = async () => {
    if (!newItemName || !newItemCategory) return alert("入力不備があります");
    if (nameWarning && !confirm(`警告: ${nameWarning}\n登録しますか？`)) return;
    setIsProcessing(true);
    try {
      const trans: any = {};
      await Promise.all(LANGUAGES.map(async (l) => {
        const res = await translateTexts([newItemName, newItemDesc, newItemCategory], l.target);
        trans[l.code] = { name: res[0], desc: res[1], category: res[2] };
      }));
      const newItem = {
        id: `id-${Date.now()}`, name: newItemName, desc: newItemDesc, price: newItemPrice, image: newItemImage, category: newItemCategory, type: newItemType, categoryEnglish: trans['en']?.category || newItemCategory, isRecommended: false, isInsta: false, isSoldOut: false, translations: trans
      };
      await saveToFirebase({ items: [...items, newItem] }, "登録しました");
      setItems([...items, newItem]); 
      setNewItemName(""); setNewItemDesc(""); setNewItemPrice(""); setNewItemImage(""); setShowItemForm(false);
    } catch (e) {} finally { setIsProcessing(false); }
  };

  const toggleSoldOut = async (item: any) => {
    const newItems = items.map(i => i.id === item.id ? { ...i, isSoldOut: !i.isSoldOut } : i);
    setItems(newItems);
    try {
        await saveToFirebase({ items: newItems });
        alert(item.isSoldOut ? "販売再開しました" : "売切に設定しました");
    } catch(e) { setItems(items); }
  };

  const saveEditedItem = async () => {
    if (!editingItem) return;
    const newItems = items.map(i => i.id === editingItem.id ? editingItem : i);
    setIsProcessing(true);
    try {
        await saveToFirebase({ items: newItems }, "保存しました");
        setItems(newItems);
        setEditingItem(null);
    } catch(e) {} finally { setIsProcessing(false); }
  };

  const reTranslateAndSaveItem = async () => {
    if (!editingItem) return;
    if (!confirm(`再翻訳して上書きしますか？`)) return;
    setIsProcessing(true);
    try {
      const translations: any = {};
      const promises = LANGUAGES.map(async (lang) => {
        const results = await translateTexts([editingItem.name, editingItem.desc, editingItem.category], lang.target);
        translations[lang.code] = { name: results[0], desc: results[1], category: results[2] };
      });
      await Promise.all(promises);
      const updatedItem = { ...editingItem, translations, categoryEnglish: translations['en']?.category || editingItem.category };
      const newItems = items.map(i => i.id === editingItem.id ? updatedItem : i);
      await saveToFirebase({ items: newItems });
      setItems(newItems);
      setEditingItem(null);
      alert("翻訳更新しました");
    } catch(e) { alert("翻訳エラー"); } finally { setIsProcessing(false); }
  };

  const deleteItem = async (itemId: string) => {
      if(!confirm("本当に削除しますか？")) return;
      const newItems = items.filter(i => i.id !== itemId);
      setIsProcessing(true);
      try {
        await saveToFirebase({ items: newItems }, "削除しました");
        setItems(newItems);
        setEditingItem(null);
      } catch(e) {} finally { setIsProcessing(false); }
  };

  // --- Sorting (Items) ---
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
    const sortedIds = sortingItems.map(i => i.id);
    const remainingItems = items.filter(i => !sortedIds.includes(i.id));
    let insertIndex = items.findIndex(i => i.category === targetCategory);
    if (insertIndex === -1) insertIndex = remainingItems.length;
    const newItemsOrder = [...remainingItems.slice(0, insertIndex), ...sortingItems, ...remainingItems.slice(insertIndex)];
    const uniqueItems = Array.from(new Map(newItemsOrder.map(item => [item.id, item])).values());
    setIsProcessing(true);
    try {
        await saveToFirebase({ items: uniqueItems }, "並び順を保存しました");
        setItems(uniqueItems);
        exitSorting();
    } catch(e) {} finally { setIsProcessing(false); }
  };

  // --- Featured & Settings ---
  const saveFeaturedSettings = async () => {
    setIsProcessing(true);
    try {
      let nextItems = [...items];
      const nextSlots = [...featuredSlots];
      const slotPromises = nextSlots.map(async (slot, index) => {
        if (!slot.name) return slot;
        if (slot.type === 'event') return { ...slot, itemId: null };

        // SLOT が既存商品を参照している場合は、参照先の翻訳を使う（なければ DeepL で作る）
        if (slot.itemId) {
          const existingIndex = nextItems.findIndex(i => i.id === slot.itemId);
          if (existingIndex !== -1) {
            nextItems[existingIndex] = { ...nextItems[existingIndex], isRecommended: true };
            const linked = nextItems[existingIndex];
            let slotTranslations = linked.translations;
            if (!slotTranslations) {
              slotTranslations = {};
              const promises = LANGUAGES.map(async (lang) => {
                const results = await translateTexts([linked.name || slot.name, linked.desc || slot.desc, linked.category || slot.category || "NEW"], lang.target);
                slotTranslations[lang.code] = { name: results[0], desc: results[1], category: results[2] };
              });
              await Promise.all(promises);
            }
            return {
              ...slot,
              itemId: slot.itemId,
              name: linked.name,
              desc: linked.desc,
              price: linked.price,
              image: linked.image || slot.image,
              category: linked.category,
              categoryEnglish: linked.categoryEnglish || linked.category,
              translations: slotTranslations,
            };
          }
          return slot;
        }

        // 新規スロットは DeepL で翻訳して items に新規登録
        const translations: any = {};
        const promises = LANGUAGES.map(async (lang) => {
          const results = await translateTexts([slot.name, slot.desc, slot.category || "NEW"], lang.target);
          translations[lang.code] = { name: results[0], desc: results[1], category: results[2] };
        });
        await Promise.all(promises);
        const newItemId = `id-feat-${Date.now()}-${index}`;
        const newItem = {
          id: newItemId,
          name: slot.name,
          desc: slot.desc,
          price: slot.price,
          image: slot.image,
          category: slot.category || "NEW ITEMS",
          categoryEnglish: translations['en']?.category || slot.category,
          type: slot.menuType || "grand",
          isRecommended: true,
          isSoldOut: false,
          translations: translations
        };
        nextItems.push(newItem);
        return { ...slot, itemId: newItemId, translations };
      });
      const updatedSlots = await Promise.all(slotPromises);
      await setDoc(doc(db, "settings", "menuData"), { items: nextItems, featuredSlots: updatedSlots, tabSettings, updatedAt: new Date() }, { merge: true });
      alert("ヘッダーを更新しました");
    } catch (e) { alert("保存エラー"); } finally { setIsProcessing(false); }
  };

  const saveGeneralSettings = async () => {
    setIsProcessing(true);
    try {
      const newTabSettings = { ...tabSettings };
      const promises = LANGUAGES.map(async (lang) => {
        const results = await translateTexts([tabSettings.grand?.jp || "", tabSettings.seasonal?.jp || ""], lang.target);
        if (!newTabSettings.grand) newTabSettings.grand = {};
        if (!newTabSettings.seasonal) newTabSettings.seasonal = {};
        newTabSettings.grand[lang.code] = results[0];
        newTabSettings.seasonal[lang.code] = results[1];
      });
      await Promise.all(promises);
      // featuredLabel は管理画面で用意した7言語分をそのまま保存する
      await setDoc(doc(db, "settings", "menuData"), { items, featuredSlots, tabSettings: newTabSettings, featuredLabel, updatedAt: new Date(), categoryList }, { merge: true });
      alert("設定を保存しました");
    } catch(e) { alert("エラー"); } finally { setIsProcessing(false); }
  };

  // Filter
  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    return items.filter(item => calculateSimilarity(`${item.name||""} ${item.desc||""}`, searchQuery) > 0.3);
  }, [items, searchQuery]);

  return (
    <div className="min-h-screen bg-black text-slate-100 font-sans pb-24">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xm font-black text-white tracking-[0.2em] font-['Shippori_Mincho']">MOCKTERIA</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsGrandLocked(!isGrandLocked)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all ${isGrandLocked ? 'bg-zinc-800 text-zinc-400 border border-zinc-700' : 'bg-orange-500 text-black border border-orange-400 shadow-lg shadow-orange-900/50'}`}>
            {isGrandLocked ? <Lock size={14}/> : <Unlock size={14}/>} {isGrandLocked ? '定番ロック' : '編集OK'}
          </button>
          <a href={PREVIEW_URL} target="_blank" className="bg-zinc-800 text-white border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95"><Eye size={14}/> Preview</a>
        </div>
      </header>

      <div className="p-4 max-w-md mx-auto">
        {activeTab === 'items' && (
          <div className="space-y-6">
            <div className="flex justify-end h-10">
              {sortPhase === 'none' ? (
                <button onClick={startSorting} className="bg-zinc-800 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"><Move size={14} className="text-orange-500"/> 並び替え</button>
              ) : (
                <button onClick={exitSorting} className="bg-zinc-800 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"><ArrowLeft size={14} className="text-orange-500"/> 商品登録へ</button>
              )}
            </div>

            {sortPhase === 'none' && !editingItem && (
                <div className="relative mb-4">
                    <Search className="absolute left-4 top-3.5 text-zinc-500" size={18} />
                    <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="検索..." className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:border-orange-500 outline-none" />
                </div>
            )}

            {sortPhase === 'none' && (
              <>
                {!showItemForm && !searchQuery ? (
                    <button onClick={() => setShowItemForm(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-400 font-bold flex items-center justify-center gap-2 hover:bg-zinc-900"><Plus size={20}/> 新規商品を登録</button>
                ) : showItemForm && (
                    <div className={CARD_STYLE + " animate-in fade-in slide-in-from-top-2"}>
                        <div className="flex justify-between items-center"><span className="font-bold text-sm text-orange-500">新規商品登録</span><button onClick={() => setShowItemForm(false)} className="text-zinc-500 hover:text-white"><X size={20}/></button></div>
                        <div className="flex gap-4">
                            <div className="w-24 h-24 bg-zinc-950 rounded-2xl border border-zinc-700 flex items-center justify-center relative overflow-hidden shrink-0">
                            {newItemImage ? <img src={newItemImage} className="w-full h-full object-cover" /> : <Camera className="text-zinc-600" />}
                            <input type="file" className="absolute inset-0 opacity-0" onChange={e => handleImageUpload(e, setNewItemImage)} />
                            </div>
                            <div className="flex-1 space-y-3">
                            <input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="名前" className={INPUT_STYLE} />
                            <input value={newItemPrice} onChange={e => setNewItemPrice(e.target.value)} placeholder="価格" className={INPUT_STYLE} />
                            </div>
                        </div>
                        {nameWarning && <div className="text-amber-500 text-xs">{nameWarning}</div>}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <div className="relative"><select value={newItemType} onChange={e => setNewItemType(e.target.value as MenuType)} className={`${INPUT_STYLE} appearance-none ${isGrandLocked ? 'text-zinc-500' : 'text-white'}`} disabled={isGrandLocked}><option value="seasonal">限定</option><option value="grand">定番</option></select><ChevronDown size={14} className="absolute right-3 top-4 text-zinc-500 pointer-events-none" /></div>
                            <div className="relative"><select value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)} className={`${INPUT_STYLE} appearance-none`}><option value="">カテゴリ選択</option>{categoryList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-4 text-zinc-500 pointer-events-none" /></div>
                        </div>
                        <textarea value={newItemDesc} onChange={e => setNewItemDesc(e.target.value)} placeholder="説明文" className={`${INPUT_STYLE} h-24`} />
                        <button onClick={createNewItem} disabled={isProcessing} className="w-full bg-orange-500 text-black font-black py-4 rounded-2xl flex justify-center items-center gap-2 active:scale-95 transition-transform">{isProcessing ? <Loader2 className="animate-spin" size={18}/> : <RefreshCw size={18} />} 登録</button>
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
                        {categoryList.map(cat => {
                            const targetItems = itemsInType.filter(i => i.category === cat.name);
                            if (targetItems.length === 0) return null;
                            return (
                            <div key={cat.name} className="mb-6">
                                <h4 className="text-xs text-zinc-500 mb-2 font-bold px-1">{cat.name}</h4>
                                <div className="space-y-2">
                                {targetItems.map(item => (
                                    <div key={item.id} className={`bg-zinc-900 p-3 rounded-2xl border flex gap-3 items-center shadow-lg ${item.isSoldOut ? 'border-red-500/30' : 'border-zinc-700/50'}`}>
                                    <div className="w-12 h-12 bg-black rounded-xl overflow-hidden relative shrink-0 border border-zinc-800"><img src={item.image} className={`w-full h-full object-cover ${item.isSoldOut ? 'opacity-40 grayscale' : ''}`} />{item.isSoldOut && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[8px] font-black text-red-500">SOLD</div>}</div>
                                    <div className="flex-1 min-w-0"><div className="font-bold text-sm truncate">{item.name}</div><div className="text-[10px] text-zinc-500 truncate">¥{item.price}</div></div>
                                    <button onClick={() => toggleSoldOut(item)} className={`p-2 rounded-xl border ${item.isSoldOut ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}><Ban size={16}/></button>
                                    <button onClick={() => setEditingItem({...item, name: item.name||"", price: item.price||"", desc: item.desc||"", category: item.category||""})} className="p-2 rounded-xl border bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700" disabled={isGrandLocked && type === 'grand'}><Edit3 size={16}/></button>
                                    <button onClick={() => deleteItem(item.id)} className="p-2 rounded-xl border bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20" disabled={isGrandLocked && type === 'grand'}><Trash2 size={16}/></button>
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
              <div className="space-y-6 pt-4">
                <div className="text-center mb-8"><h2 className="text-lg font-bold">並び替えるカテゴリを選択</h2></div>
                <div className="grid gap-3">{categoryList.map(cat => (<button key={cat.name} onClick={() => selectCategoryToSort(cat.name)} className="w-full bg-zinc-900 p-4 rounded-2xl border border-zinc-700 text-left font-bold text-sm">{cat.name}</button>))}</div>
              </div>
            )}

            {sortPhase === 'sorting' && (
              <div className="space-y-6 pt-4">
                <div className="flex justify-between"><button onClick={() => setSortPhase('select_category')} className="text-zinc-400 text-xs flex items-center gap-1"><ArrowLeft size={16}/> 戻る</button><button onClick={saveSortedOrder} className="bg-orange-500 text-black px-5 py-2.5 rounded-2xl font-bold text-xs flex items-center gap-1"><CheckCircle2 size={16}/> 保存</button></div>
                <div className="space-y-2">{sortingItems.map((item, idx) => (<div key={item.id} className="bg-zinc-800 p-3 rounded-2xl flex justify-between items-center"><span className="font-bold text-sm">{item.name}</span><div className="flex gap-1"><button onClick={() => moveSortItem(idx, 'up')} className="p-2 bg-black rounded text-white"><ArrowUp/></button><button onClick={() => moveSortItem(idx, 'down')} className="p-2 bg-black rounded text-white"><ArrowDown/></button></div></div>))}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-6">
            <div className="flex justify-end h-10">
                {!isCatSorting ? (
                    <button onClick={() => setIsCatSorting(true)} className="bg-zinc-800 text-white border border-white/20 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"><Move size={14} className="text-orange-500"/> 並び替え</button>
                ) : (
                    <button onClick={saveCategoryOrder} className="bg-orange-500 text-black px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 animate-pulse"><CheckCircle2 size={14}/> 保存</button>
                )}
            </div>

            {!isCatSorting ? (
                <>
                    {!showCatForm ? (
                        <button onClick={() => setShowCatForm(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 text-zinc-400 font-bold flex items-center justify-center gap-2 hover:bg-zinc-900"><Plus size={20}/> 新規カテゴリ追加</button>
                    ) : (
                        <div className={CARD_STYLE}>
                            <div className="flex justify-between items-center"><h3 className="font-bold text-orange-500 text-sm">新規カテゴリ</h3><button onClick={() => setShowCatForm(false)}><X size={20}/></button></div>
                            {catWarning && <div className="text-amber-500 text-xs flex items-center gap-1"><AlertTriangle size={12}/>{catWarning}</div>}
                            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="カテゴリ名" className={INPUT_STYLE} />
                            <button onClick={addCategory} className="w-full bg-white text-black font-black py-4 rounded-2xl mt-2">作成</button>
                        </div>
                    )}
                    <div className="space-y-3 pt-2">
                        {categoryList.map(cat => (
                            <div key={cat.name} className="bg-zinc-900 p-4 rounded-2xl border border-zinc-700/50 flex justify-between items-center">
                                {editingCategoryName === cat.name ? (
                                    <div className="flex gap-2 w-full">
                                        <input autoFocus value={editCatNameInput} onChange={e => setEditCatNameInput(e.target.value)} className={INPUT_STYLE} />
                                        <button onClick={executeCategoryUpdate} disabled={isProcessing} className="bg-orange-500 text-black px-3 rounded-lg font-bold text-xs shrink-0">{isProcessing ? <Loader2 size={14} className="animate-spin"/> : "保存"}</button>
                                        <button onClick={() => setEditingCategoryName(null)} className="bg-zinc-800 text-white px-3 rounded-lg text-xs border border-zinc-600 shrink-0">停止</button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="font-bold text-sm tracking-wider">{cat.name}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => startEditingCategory(cat.name)} className="p-2.5 bg-zinc-800 rounded-xl border border-zinc-700"><Edit3 size={16}/></button>
                                            <button onClick={() => deleteCategory(cat.name)} className="p-2.5 bg-red-500/10 text-red-500 rounded-xl border border-red-500/20"><Trash2 size={16}/></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="space-y-2">
                    {categoryList.map((cat, idx) => (
                        <div key={cat.name} className="bg-zinc-800 p-3 rounded-2xl flex justify-between items-center border border-orange-500/30">
                            <span className="font-bold text-sm">{cat.name}</span>
                            <div className="flex gap-1">
                                <button onClick={() => moveCategory(idx, 'up')} className="p-2 bg-black rounded text-white"><ArrowUp/></button>
                                <button onClick={() => moveCategory(idx, 'down')} className="p-2 bg-black rounded text-white"><ArrowDown/></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>
        )}

        {/* Header Tab */}
        {activeTab === 'header' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-zinc-900 p-4 rounded-xl border border-zinc-700/50 sticky top-16 z-20 shadow-xl">
              <span className="font-bold text-sm">ヘッダー設定</span>
              <button onClick={saveFeaturedSettings} disabled={isProcessing} className="bg-white text-black px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><Save size={14}/>保存</button>
            </div>
            <div className="space-y-6">
              {featuredSlots.map((slot, idx) => (
                <div key={idx} className={CARD_STYLE}>
                  <div className="flex justify-between text-[10px] text-zinc-500 font-bold uppercase mb-3"><span>SLOT {idx + 1}</span><span className={slot.itemId ? "text-green-500" : "text-orange-500"}>{slot.itemId ? "🔗 既存リンク" : "✨ 新規作成"}</span></div>
                  <div className="space-y-4">
                    <div className="aspect-video bg-zinc-950 rounded-xl overflow-hidden relative border border-zinc-700 group">
                      {slot.image ? <img src={slot.image} className="w-full h-full object-cover opacity-80" /> : <div className="w-full h-full flex items-center justify-center text-zinc-700"><Camera /></div>}
                      <input type="file" className="absolute inset-0 opacity-0 z-10" onChange={e => handleImageUpload(e, (b64) => { const ns=[...featuredSlots]; ns[idx]={...ns[idx], image: b64}; setFeaturedSlots(ns); })} />
                    </div>
                    <select className={INPUT_STYLE} value={slot.itemId || ""} onChange={(e) => { const targetId = e.target.value; const ns = [...featuredSlots]; if (!targetId) { ns[idx] = { ...ns[idx], itemId: null }; } else { const item = items.find(i => i.id === targetId); if (item) ns[idx] = { ...ns[idx], itemId: item.id, name: item.name, desc: item.desc, price: item.price, image: item.image || ns[idx].image, category: item.category }; } setFeaturedSlots(ns); }}>
                      <option value="">▼ 既存商品から選ぶ</option>{items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <input value={slot.name || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].name=e.target.value; setFeaturedSlots(ns)}} placeholder="タイトル" className={INPUT_STYLE} />
                    <textarea value={slot.desc || ""} onChange={e => {const ns=[...featuredSlots]; ns[idx].desc=e.target.value; setFeaturedSlots(ns)}} placeholder="説明文" className={`${INPUT_STYLE} h-20`} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-8">
            <div className={CARD_STYLE}>
              <h3 className="font-bold text-orange-500 text-xs">General Settings</h3>
              <div className="space-y-5 pt-2">
                <div><label className="text-[10px] text-zinc-500">Grand Menu Tab Name</label><input value={tabSettings.grand?.jp || ""} onChange={e => setTabSettings({...tabSettings, grand: {...(tabSettings?.grand || {}), jp: e.target.value}})} className={INPUT_STYLE} /></div>
                <div><label className="text-[10px] text-zinc-500">Seasonal Menu Tab Name</label><input value={tabSettings.seasonal?.jp || ""} onChange={e => setTabSettings({...tabSettings, seasonal: {...(tabSettings?.seasonal || {}), jp: e.target.value}})} className={INPUT_STYLE} /></div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="text-[10px] text-zinc-500">ヘッダーラベル（今月のおすすめ） — 各言語分の文字列をここで用意してください（手動入力）</div>
                <input value={featuredLabel.jp || ""} onChange={e => setFeaturedLabel({...featuredLabel, jp: e.target.value})} className={INPUT_STYLE} placeholder="日本語 (例: 今月のおすすめ)" />
                {LANGUAGES.map(l => (
                  <input key={l.code} value={featuredLabel[l.code] || ""} onChange={e => setFeaturedLabel({...featuredLabel, [l.code]: e.target.value})} className={INPUT_STYLE} placeholder={`${l.code} (${l.target || l.code}) の表記`} />
                ))}
              </div>
              <button onClick={saveGeneralSettings} disabled={isProcessing} className="w-full bg-white text-black font-black py-4 rounded-2xl mt-4 flex items-center justify-center gap-2"><Save size={16}/>全設定を保存・翻訳</button>
            </div>
            <div className="flex justify-center"><button onClick={() => setShowCreditModal(true)} className="text-[10px] text-zinc-500 border border-zinc-800 px-4 py-2 rounded-full flex items-center gap-1"><Info size={12}/>クレジット・利用規約</button></div>
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-3xl p-6 space-y-5">
            <div className="flex justify-between items-center"><h3 className="font-bold text-white">Product Edit</h3><button onClick={() => setEditingItem(null)}><X/></button></div>
            <div className="flex gap-4">
                <div className="w-24 h-24 bg-black rounded-xl overflow-hidden relative">
                    {editingItem.image ? <img src={editingItem.image} className="w-full h-full object-cover"/> : <Camera className="m-auto mt-8 text-zinc-600"/>}
                    <input type="file" className="absolute inset-0 opacity-0" onChange={e => handleImageUpload(e, (b64) => setEditingItem({...editingItem, image: b64}))}/>
                </div>
                <div className="flex-1 space-y-2">
                    <input value={editingItem.name || ""} onChange={e => setEditingItem({...editingItem, name: e.target.value})} className={INPUT_STYLE} placeholder="Name"/>
                    <input value={editingItem.price || ""} onChange={e => setEditingItem({...editingItem, price: e.target.value})} className={INPUT_STYLE} placeholder="Price"/>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <select value={editingItem.type || 'grand'} onChange={e => setEditingItem({...editingItem, type: e.target.value})} className={INPUT_STYLE}><option value="grand">Grand</option><option value="seasonal">Seasonal</option></select>
                <select value={editingItem.category || ""} onChange={e => setEditingItem({...editingItem, category: e.target.value})} className={INPUT_STYLE}><option value="">Category...</option>{categoryList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
            </div>
            <textarea value={editingItem.desc || ""} onChange={e => setEditingItem({...editingItem, desc: e.target.value})} className={`${INPUT_STYLE} h-24`}/>
            <div className="flex gap-2">
                <button onClick={saveEditedItem} className="flex-1 bg-white text-black font-bold py-3 rounded-xl flex items-center justify-center gap-1"><Save size={16}/> Save</button>
                <button onClick={reTranslateAndSaveItem} className="flex-1 bg-blue-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2"><RefreshCw size={16}/> Translate</button>
            </div>
            <button onClick={() => deleteItem(editingItem.id)} className="w-full text-red-500 text-xs py-2 flex items-center justify-center gap-1"><Trash2 size={12}/> Delete Item</button>
          </div>
        </div>
      )}

      {/* Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 z-[150] bg-black/95 flex items-center justify-center p-6" onClick={() => setShowCreditModal(false)}>
          <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl p-8 space-y-6 text-xs text-zinc-400 font-serif">
            <h2 className="text-lg font-black text-white">CREDIT & TERMS</h2>
            <p>アプリ名：MOCKTERIA<br/>開発者：PLANT FIELDS 植田 太雅</p>
            <p>© 2026 PLANT FIELDS / Taiga Ueda. All rights reserved.</p>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="fixed bottom-0 w-full bg-zinc-950/90 border-t border-white/5 flex justify-around pt-3 pb-8 z-[60]">
        <button onClick={() => setActiveTab('items')} className={`flex flex-col items-center ${activeTab==='items'?'text-orange-500':'text-zinc-600'}`}><Coffee size={24}/><span className="text-[9px] font-bold">Items</span></button>
        <button onClick={() => { setActiveTab('categories'); setIsCatSorting(false); }} className={`flex flex-col items-center ${activeTab==='categories'?'text-orange-500':'text-zinc-600'}`}><Layers size={24}/><span className="text-[9px] font-bold">Cat</span></button>
        <button onClick={() => setActiveTab('header')} className={`flex flex-col items-center ${activeTab==='header'?'text-orange-500':'text-zinc-600'}`}><LayoutTemplate size={24}/><span className="text-[9px] font-bold">Head</span></button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center ${activeTab==='settings'?'text-orange-500':'text-zinc-600'}`}><Settings size={24}/><span className="text-[9px] font-bold">Set</span></button>
      </nav>
    </div>
  );
}