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
import { Category, Product, AttributeGroup, AttributeOption } from '@/lib/types';
import { createProduct, updateProduct, uploadImages, getProductTags } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
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

const emptyOption = (): AttributeOption => ({ label: '', value: '', priceModifier: 0 });
const emptyGroup = (): AttributeGroup => ({ name: '', options: [emptyOption()] });

const AddProductForm = ({ categories, onClose, onCreated, editProduct }: Props) => {
  const isEdit = !!editProduct;

  const [name, setName] = useState(editProduct?.name ?? '');
  const [slug, setSlug] = useState(editProduct?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(editProduct?.description ?? '');
  const [price, setPrice] = useState(editProduct ? String(editProduct.price) : '');
  const [stock, setStock] = useState(editProduct ? String(editProduct.stock) : '');
  const [categoryId, setCategoryId] = useState(editProduct?.categoryId ?? '');
  const [featured, setFeatured] = useState(editProduct?.featured ?? false);

  // Existing URLs (from saved product); new files picked by user
  const [existingImages, setExistingImages] = useState<string[]>(editProduct?.images ?? []);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);

  const [youtubeLinks, setYoutubeLinks] = useState<string[]>(
    editProduct?.youtubeLinks?.length ? editProduct.youtubeLinks : ['']
  );
  const [attributes, setAttributes] = useState<AttributeGroup[]>(
    editProduct?.attributes ?? []
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

  function addAttributeGroup() { setAttributes(prev => [...prev, emptyGroup()]); }
  function removeAttributeGroup(gi: number) {
    setAttributes(prev => prev.filter((_, i) => i !== gi));
  }
  function updateGroupName(gi: number, val: string) {
    setAttributes(prev => prev.map((g, i) => (i === gi ? { ...g, name: val } : g)));
  }
  function addOption(gi: number) {
    setAttributes(prev =>
      prev.map((g, i) => (i === gi ? { ...g, options: [...g.options, emptyOption()] } : g))
    );
  }
  function removeOption(gi: number, oi: number) {
    setAttributes(prev =>
      prev.map((g, i) =>
        i === gi ? { ...g, options: g.options.filter((_, j) => j !== oi) } : g
      )
    );
  }
  function updateOption(gi: number, oi: number, field: keyof AttributeOption, val: string | number) {
    setAttributes(prev =>
      prev.map((g, i) =>
        i === gi
          ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, [field]: val } : o)) }
          : g
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error('পণ্যের নাম দিন');
    if (!price || isNaN(Number(price))) return toast.error('সঠিক দাম দিন');
    if (!categoryId) return toast.error('ক্যাটাগরি নির্বাচন করুন');

    setSaving(true);
    try {
      let uploadedUrls: string[] = [];
      if (newImageFiles.length > 0) {
        uploadedUrls = await uploadImages(newImageFiles);
      }

      const allImages = [...existingImages, ...uploadedUrls];
      const cleanYoutubeLinks = youtubeLinks.filter(l => l.trim() !== '');
      const cleanAttributes = attributes.filter(
        g => g.name.trim() !== '' && g.options.some(o => o.label.trim() !== '')
      );

      const payload = {
        name: name.trim(),
        slug: slug.trim() || slugify(name.trim()),
        description: description.trim(),
        price: Number(price),
        stock: Number(stock) || 0,
        categoryId,
        featured,
        images: allImages,
        youtubeLinks: cleanYoutubeLinks,
        attributes: cleanAttributes,
        tags,
      };

      if (isEdit) {
        const updated = await updateProduct(editProduct.id, payload);
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
        <div className="flex items-center justify-between px-6 py-4 bg-primary text-primary-foreground flex-shrink-0">
          <h2 className="text-lg font-bold">
            {isEdit ? 'পণ্য সম্পাদনা করুন' : 'নতুন পণ্য যোগ করুন'}
          </h2>
          <button
            onClick={onClose}
            className="hover:bg-white/10 rounded-md p-1 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id="add-product-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">দাম (টাকা) *</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="০"
                    className="mt-1 bg-card"
                  />
                </div>
                <div>
                  <Label htmlFor="stock">স্টক পরিমাণ</Label>
                  <Input
                    id="stock"
                    type="number"
                    min="0"
                    value={stock}
                    onChange={e => setStock(e.target.value)}
                    placeholder="০"
                    className="mt-1 bg-card"
                  />
                </div>
              </div>

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
                    onClick={() => removeExistingImage(i)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                    onClick={() => removeNewImage(i)}
                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
                কোনো ছবি নির্বাচন করা হয়নি — ছবি না দিলে প্লেসহোল্ডার দেখাবে
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
                      className="text-destructive hover:text-destructive/80 p-2"
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
              className="mt-2 text-sm text-secondary hover:text-secondary/80 flex items-center gap-1 font-medium"
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
                    <button type="button" onClick={e => { e.stopPropagation(); removeTag(i); }} className="hover:text-destructive">
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
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          </section>

          {/* Attributes */}
          <section>
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-1">
              অ্যাট্রিবিউট / বিকল্প
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              যেমন: পরিমাণ → ১ লিটার, ২ লিটার; ওজন → ২৫০ গ্রাম, ৫০০ গ্রাম
            </p>

            {attributes.length === 0 && (
              <div className="text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2 mb-3">
                কোনো অ্যাট্রিবিউট নেই — সরল পণ্যের জন্য এটি ঐচ্ছিক
              </div>
            )}

            {attributes.map((group, gi) => (
              <div key={gi} className="bg-card border border-border rounded-lg p-4 mb-3">
                <div className="flex items-center gap-2 mb-3">
                  <Input
                    value={group.name}
                    onChange={e => updateGroupName(gi, e.target.value)}
                    placeholder="অ্যাট্রিবিউটের নাম (যেমন: পরিমাণ)"
                    className="bg-background font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttributeGroup(gi)}
                    className="text-destructive hover:text-destructive/80 p-1 flex-shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="space-y-2">
                  {group.options.map((opt, oi) => (
                    <div key={oi} className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 items-center">
                      <Input
                        value={opt.label}
                        onChange={e => updateOption(gi, oi, 'label', e.target.value)}
                        placeholder="নাম (১ লিটার)"
                        className="bg-background text-sm"
                      />
                      <Input
                        value={opt.value}
                        onChange={e => updateOption(gi, oi, 'value', e.target.value)}
                        placeholder="মান (1L)"
                        className="bg-background text-sm font-mono"
                      />
                      <Input
                        type="number"
                        value={opt.priceModifier}
                        onChange={e => updateOption(gi, oi, 'priceModifier', Number(e.target.value))}
                        placeholder="+৳০"
                        className="bg-background text-sm text-center"
                      />
                      {group.options.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeOption(gi, oi)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 text-xs text-muted-foreground pl-1">
                    <span>প্রদর্শনী নাম</span>
                    <span>ইন্টার্নাল মান</span>
                    <span className="text-center">মূল্য পরিবর্তন</span>
                    <span />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => addOption(gi)}
                  className="mt-2 text-xs text-secondary hover:text-secondary/80 flex items-center gap-1 font-medium"
                >
                  <Plus size={13} /> বিকল্প যোগ করুন
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={addAttributeGroup}
              className="text-sm text-secondary hover:text-secondary/80 flex items-center gap-1 font-medium border border-dashed border-secondary/40 rounded-md px-3 py-2 w-full justify-center hover:bg-secondary/5 transition-colors"
            >
              <Plus size={15} /> নতুন অ্যাট্রিবিউট গ্রুপ যোগ করুন
            </button>
          </section>
        </form>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-card flex-shrink-0">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            বাতিল করুন
          </Button>
          <Button
            type="submit"
            form="add-product-form"
            disabled={saving}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/90 min-w-[120px]"
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
