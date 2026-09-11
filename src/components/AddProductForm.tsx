import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Upload, Link as LinkIcon, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Category, Product, ProductKind } from '@/lib/types';
import { changeProductKind, createProduct, updateProduct, uploadImages, getProductTags } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { productKindLabel, rateLabel } from '@/lib/quantity';
import { toast } from 'sonner';

interface Props {
  categories: Category[];
  onClose: () => void;
  onCreated: (product: Product) => void;
  /** When provided the form operates in edit mode */
  editProduct?: Product;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u0980-\u09FF-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const AddProductForm = ({ categories, onClose, onCreated, editProduct }: Props) => {
  const isEdit = !!editProduct;

  const [name, setName] = useState(editProduct?.name ?? '');
  const [slug, setSlug] = useState(editProduct?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(editProduct?.description ?? '');
  const [kind, setKind] = useState<ProductKind>(editProduct?.kind ?? 'PACKAGED');
  const [price, setPrice] = useState(editProduct ? String(editProduct.price) : '');
  const initialThreshold = editProduct?.variants?.[0]?.lowStockThreshold ?? 5;
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String((editProduct?.kind ?? 'PACKAGED') === 'PACKAGED' ? initialThreshold : initialThreshold / 1_000),
  );
  const [kindChangeReason, setKindChangeReason] = useState('');
  const [variantName, setVariantName] = useState(
    editProduct?.variantName && editProduct.variantName.toLowerCase() !== 'default'
      ? editProduct.variantName
      : '',
  );
  const [categoryId, setCategoryId] = useState(editProduct?.categoryId ?? '');
  const [featured, setFeatured] = useState(editProduct?.featured ?? false);

  // Existing URLs (from saved product); new files picked by user
  const [existingImages, setExistingImages] = useState<string[]>(editProduct?.images ?? []);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);

  const [youtubeLinks, setYoutubeLinks] = useState<string[]>(
    editProduct?.youtubeLinks?.length ? editProduct.youtubeLinks : ['']
  );
  const [tags, setTags] = useState<string[]>(editProduct?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProductTags().then(setAllTags).catch(() => {});
  }, []);

  function handleNameChange(val: string) {
    setName(val);
    if (!slugTouched) setSlug(slugify(val));
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setNewImageFiles(prev => [...prev, ...files]);
    setNewImagePreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    e.target.value = '';
  }

  function removeExistingImage(i: number) {
    setExistingImages(prev => prev.filter((_, idx) => idx !== i));
  }

  function removeNewImage(i: number) {
    URL.revokeObjectURL(newImagePreviews[i]);
    setNewImageFiles(prev => prev.filter((_, idx) => idx !== i));
    setNewImagePreviews(prev => prev.filter((_, idx) => idx !== i));
  }

  function setYoutubeLink(i: number, val: string) {
    setYoutubeLinks(prev => prev.map((l, idx) => (idx === i ? val : l)));
  }
  function addYoutubeLink() { setYoutubeLinks(prev => [...prev, '']); }
  function removeYoutubeLink(i: number) {
    setYoutubeLinks(prev => prev.filter((_, idx) => idx !== i));
  }

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) setTags(prev => [...prev, tag]);
    setTagInput('');
  }
  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(prev => prev.slice(0, -1));
    }
  }
  function removeTag(i: number) { setTags(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('পণ্যের নাম দিন');
    if (!isEdit && (!price || isNaN(Number(price)))) return toast.error('সঠিক দাম দিন');
    if (!categoryId) return toast.error('ক্যাটাগরি নির্বাচন করুন');
    const thresholdNumber = Number(lowStockThreshold);
    if (!Number.isFinite(thresholdNumber) || thresholdNumber < 0 || (kind !== 'PACKAGED' && thresholdNumber * 1_000 % 1 !== 0)) {
      return toast.error('সঠিক লো-স্টক সীমা দিন');
    }
    const thresholdBase = kind === 'PACKAGED' ? Math.round(thresholdNumber) : Math.round(thresholdNumber * 1_000);
    const kindChanged = isEdit && kind !== (editProduct.kind ?? 'PACKAGED');
    setSaving(true);
    try {
      let uploadedUrls: string[] = [];
      if (newImageFiles.length > 0) {
        uploadedUrls = await uploadImages(newImageFiles);
      }

      const allImages = [...existingImages, ...uploadedUrls];
      const cleanYoutubeLinks = youtubeLinks.filter(l => l.trim() !== '');
      const payload = {
        name: name.trim(),
        slug: slug.trim() || slugify(name.trim()),
        description: description.trim(),
        price: Number(price),
        stock: editProduct?.stock ?? 0,
        variantName: variantName.trim(),
        kind,
        initialLowStockThreshold: thresholdBase,
        categoryId,
        featured,
        images: allImages,
        youtubeLinks: cleanYoutubeLinks,
        tags,
      };

      if (isEdit) {
        let updated = await updateProduct(editProduct.id, payload);
        if (kindChanged) {
          updated = await changeProductKind(editProduct.id, {
            kind,
            sellingPrice: Number(price),
            lowStockThreshold: thresholdBase,
            reason: kindChangeReason.trim() || undefined,
          });
        }
        toast.success(`"${updated.name}" আপডেট হয়েছে`);
        onCreated(updated);
      } else {
        const created = await createProduct(payload);
        toast.success(`"${created.name}" পণ্য সফলভাবে যোগ করা হয়েছে`);
        onCreated(created);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'সংরক্ষণ করতে ব্যর্থ হয়েছে'));
    } finally {
      setSaving(false);
    }
  }

  const totalImages = existingImages.length + newImagePreviews.length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex items-start justify-end w-full max-w-2xl">
      <div className="h-full w-full bg-background shadow-2xl flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between bg-primary px-4 py-3 text-primary-foreground sm:px-6 sm:py-4">
          <h2 className="text-lg font-bold">
            {isEdit ? 'পণ্য সম্পাদনা' : 'নতুন পণ্য'}
          </h2>
          <button
            type="button"
            aria-label="বন্ধ করুন"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-white/10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id="add-product-form"
          onSubmit={handleSubmit}
          className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
        >
          {/* Basic info */}
          <section>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              মৌলিক তথ্য
            </h3>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">পণ্যের নাম *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="যেমন: দেশি গরুর দুধ"
                  className="mt-1 bg-card"
                />
              </div>

              <div>
                <Label htmlFor="slug">স্লাগ (URL)</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={e => { setSlugTouched(true); setSlug(e.target.value); }}
                  placeholder="deshi-gorur-dudh"
                  className="mt-1 bg-card font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL: /products/{slug || '...'}
                </p>
              </div>

              <div>
                <Label htmlFor="description">বিবরণ</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  placeholder="পণ্যের বিস্তারিত বিবরণ লিখুন..."
                  className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>

              <div>
                <Label htmlFor="product-kind">পণ্যের ধরন *</Label>
                <select
                  id="product-kind"
                  className="mt-1 h-11 w-full rounded-md border bg-card px-3 md:h-10"
                  value={kind}
                  onChange={(event) => {
                    const next = event.target.value as ProductKind;
                    setKind(next);
                    setVariantName('');
                    setLowStockThreshold(next === 'PACKAGED' ? '5' : '5');
                  }}
                >
                  <option value="PACKAGED">প্যাকেট বা নির্দিষ্ট সাইজ</option>
                  <option value="LOOSE_WEIGHT">খোলা পণ্য, ওজনে বিক্রি</option>
                  <option value="LOOSE_VOLUME">খোলা পণ্য, লিটারে বিক্রি</option>
                </select>
                <p className="mt-1 text-xs text-muted-foreground">বর্তমান ধরন: {productKindLabel(kind)}</p>
              </div>

              <div>
                <Label htmlFor="price">{kind === 'LOOSE_WEIGHT'
                  ? 'প্রতি কেজি বিক্রির দাম (টাকা) *'
                  : kind === 'LOOSE_VOLUME'
                    ? 'প্রতি লিটার বিক্রির দাম (টাকা) *'
                    : isEdit ? 'মূল প্যাক/সাইজের বর্তমান দাম' : 'প্রাথমিক দাম (টাকা) *'}</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    disabled={isEdit && kind === (editProduct?.kind ?? 'PACKAGED')}
                    placeholder="০"
                    className="mt-1 bg-card"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{rateLabel(kind)} দাম</p>
                  {isEdit && kind === (editProduct?.kind ?? 'PACKAGED') && <p className="text-xs text-muted-foreground mt-1">দাম পরিবর্তন করতে “{kind === 'PACKAGED' ? 'প্যাক/সাইজ ও দাম' : 'দাম ও স্টক সীমা'}” খুলুন।</p>}
              </div>

              {!isEdit && kind === 'PACKAGED' && <div>
                <Label htmlFor="variant-name">প্যাক/সাইজ (ঐচ্ছিক)</Label>
                <Input
                  id="variant-name"
                  value={variantName}
                  onChange={e => setVariantName(e.target.value)}
                  placeholder="যেমন: ১ কেজি"
                  className="mt-1 bg-card"
                />
                <p className="mt-1 text-xs text-muted-foreground">একাধিক প্যাক/সাইজ থাকলে এখানে প্রথমটির নাম দিন।</p>
              </div>}

              {(kind !== 'PACKAGED' || (isEdit && kind !== (editProduct?.kind ?? 'PACKAGED'))) && <div>
                <Label htmlFor="low-stock-threshold">লো-স্টক সীমা ({kind === 'LOOSE_WEIGHT' ? 'কেজি' : kind === 'LOOSE_VOLUME' ? 'লিটার' : 'ইউনিট'})</Label>
                <Input id="low-stock-threshold" type="number" min="0" step={kind === 'PACKAGED' ? '1' : '0.001'} value={lowStockThreshold} onChange={(event) => setLowStockThreshold(event.target.value)} className="mt-1 bg-card" />
              </div>}

              {isEdit && kind !== (editProduct?.kind ?? 'PACKAGED') && <div>
                <Label htmlFor="kind-change-reason">ধরন পরিবর্তনের কারণ (ঐচ্ছিক)</Label>
                <Input id="kind-change-reason" value={kindChangeReason} onChange={(event) => setKindChangeReason(event.target.value)} className="mt-1 bg-card" />
                <p className="mt-1 text-xs text-muted-foreground">স্টক, বিক্রি বা দামের পরিবর্তন থাকলে ধরন বদলানো যাবে না।</p>
              </div>}

              <div>
                <Label>ক্যাটাগরি *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="mt-1 bg-card">
                    <SelectValue placeholder="ক্যাটাগরি নির্বাচন করুন" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={e => setFeatured(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-secondary"
                />
                <span className="text-sm font-medium">হোমপেজে ফিচার করুন</span>
              </label>
            </div>
          </section>

          {/* Images */}
          <section>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              পণ্যের ছবি
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
              {/* Existing saved images */}
              {existingImages.map((src, i) => (
                <div key={`existing-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted group">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    aria-label="সংরক্ষিত ছবি সরান"
                    onClick={() => removeExistingImage(i)}
                    className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 opacity-100 transition-opacity sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 size={18} className="text-white" />
                  </button>
                </div>
              ))}
              {/* Newly picked images */}
              {newImagePreviews.map((src, i) => (
                <div key={`new-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-secondary/40 bg-muted group">
                  <img src={src} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-1 right-1 bg-secondary text-secondary-foreground text-[10px] px-1 rounded">নতুন</div>
                  <button
                    type="button"
                    aria-label="নতুন ছবি সরান"
                    onClick={() => removeNewImage(i)}
                    className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 opacity-100 transition-opacity sm:h-9 sm:w-9 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 size={18} className="text-white" />
                  </button>
                </div>
              ))}
              <label className="aspect-square rounded-lg border-2 border-dashed border-border bg-muted flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-secondary hover:bg-secondary/5 transition-colors">
                <Upload size={20} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">ছবি যোগ করুন</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={handleImagePick}
                />
              </label>
            </div>
            {totalImages === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                <ImageIcon size={16} />
                কোনো ছবি দেওয়া হয়নি। ছবি না দিলে ডিফল্ট ছবি দেখাবে।
              </div>
            )}
          </section>

          {/* YouTube links */}
          <section>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">
              ইউটিউব ভিডিও লিংক
            </h3>
            <div className="space-y-2">
              {youtubeLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                    <Input
                      value={link}
                      onChange={e => setYoutubeLink(i, e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="pl-8 bg-card text-sm"
                    />
                  </div>
                  {youtubeLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeYoutubeLink(i)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 hover:text-destructive/80"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addYoutubeLink}
              className="mt-2 flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-secondary hover:bg-muted hover:text-secondary/80"
            >
              <Plus size={15} /> আরো লিংক যোগ করুন
            </button>
          </section>

          {/* Tags */}
          <section>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
              ট্যাগ
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Enter বা কমা চেপে ট্যাগ যোগ করুন
            </p>
            <div className="relative">
              <div
                className="flex flex-wrap gap-2 p-2 rounded-md border border-input bg-card min-h-[40px] cursor-text"
                onClick={() => tagInputRef.current?.focus()}
              >
                {tags.map((tag, i) => (
                  <span key={i} className="flex items-center gap-1 bg-secondary/20 text-secondary-foreground text-xs font-medium px-2 py-1 rounded-full">
                    #{tag}
                    <button type="button" aria-label={`${tag} ট্যাগ সরান`} onClick={e => { e.stopPropagation(); removeTag(i); }} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-background/60 hover:text-destructive">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={e => { setTagInput(e.target.value); setShowSuggestions(true); }}
                  onKeyDown={handleTagKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={tags.length === 0 ? 'যেমন: জৈব, তাজা, দেশি' : ''}
                  className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {showSuggestions && (() => {
                const q = tagInput.trim().toLowerCase();
                const suggestions = allTags.filter(t => !tags.includes(t) && (q === '' || t.includes(q)));
                return suggestions.length > 0 ? (
                  <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
                    {suggestions.map(t => (
                      <button
                        key={t}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); addTag(t); }}
                        className="min-h-11 w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted md:min-h-9 md:py-1.5"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          </section>

        </form>

        {/* Footer actions */}
        <div className="grid flex-shrink-0 grid-cols-2 gap-2 border-t bg-card px-4 py-3 sm:flex sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          <Button className="w-full sm:w-auto" type="button" variant="ghost" onClick={onClose} disabled={saving}>
            বাতিল করুন
          </Button>
          <Button
            type="submit"
            form="add-product-form"
            disabled={saving}
            className="w-full min-w-0 bg-secondary text-secondary-foreground hover:bg-secondary/90 sm:min-w-[120px] sm:w-auto"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                সংরক্ষণ হচ্ছে...
              </span>
            ) : isEdit ? (
              'আপডেট করুন'
            ) : (
              'পণ্য সংরক্ষণ করুন'
            )}
          </Button>
        </div>
      </div>
      </div>
    </>
  );
};

export default AddProductForm;
