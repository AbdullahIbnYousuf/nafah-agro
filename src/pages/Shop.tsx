import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts, getCategories, getProductTags, GetProductsParams } from '@/lib/api';
import { Product, Category } from '@/lib/types';
import ProductCard from '@/components/ProductCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, X, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { formatBanglaNumber } from '@/lib/utils';

const LIMIT = 12;
const SORT_VALUES = ['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'] as const;

function positivePage(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

const Shop = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [filtersReady, setFiltersReady] = useState(false);

  const querySearch = searchParams.get('q') ?? '';
  const [search, setSearch] = useState(querySearch);
  const syncingSearchFromUrl = useRef(false);
  const previousQuerySearch = useRef(querySearch);
  const categoryFilter = searchParams.get('category') || 'all';
  const tagFilter = searchParams.get('tag') ?? '';
  const featuredOnly = searchParams.get('featured') === '1';
  const requestedSort = searchParams.get('sort');
  const sortBy: GetProductsParams['sort'] = SORT_VALUES.includes(requestedSort as typeof SORT_VALUES[number])
    ? requestedSort as GetProductsParams['sort']
    : 'newest';
  const page = positivePage(searchParams.get('page'));

  // Results
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebounce(search, 350);

  const updateRouteParam = useCallback((
    key: string,
    value: string | null,
    options: { replace?: boolean; resetPage?: boolean } = {},
  ) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (options.resetPage !== false && key !== 'page') next.delete('page');
      return next;
    }, { replace: options.replace });
  }, [setSearchParams]);

  // Load categories + tags once
  useEffect(() => {
    Promise.all([getCategories(), getProductTags()])
      .then(([cats, tags]) => {
        setCategories(cats);
        setAllTags(tags);
        setFiltersReady(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (querySearch !== previousQuerySearch.current) {
      previousQuerySearch.current = querySearch;
      if (querySearch !== search) {
        syncingSearchFromUrl.current = true;
        setSearch(querySearch);
      }
    }
  }, [querySearch, search]);

  useEffect(() => {
    if (syncingSearchFromUrl.current) {
      if (debouncedSearch === querySearch) syncingSearchFromUrl.current = false;
      return;
    }
    if (debouncedSearch !== querySearch) {
      updateRouteParam('q', debouncedSearch.trim() || null, { replace: true });
    }
  }, [debouncedSearch, querySearch, updateRouteParam]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    let changed = false;
    const rawQuery = next.get('q');
    if (rawQuery !== null && rawQuery !== rawQuery.trim()) {
      if (rawQuery.trim()) next.set('q', rawQuery.trim());
      else next.delete('q');
      changed = true;
    }
    const rawPage = next.get('page');
    if (rawPage && (String(positivePage(rawPage)) !== rawPage || positivePage(rawPage) === 1)) { next.delete('page'); changed = true; }
    const rawSort = next.get('sort');
    if (rawSort && (!SORT_VALUES.includes(rawSort as typeof SORT_VALUES[number]) || rawSort === 'newest')) { next.delete('sort'); changed = true; }
    const rawFeatured = next.get('featured');
    if (rawFeatured && rawFeatured !== '1') { next.delete('featured'); changed = true; }
    if (filtersReady) {
      const rawCategory = next.get('category');
      if (rawCategory && (rawCategory === 'all' || !categories.some((category) => category.slug === rawCategory))) { next.delete('category'); changed = true; }
      const rawTag = next.get('tag');
      if (rawTag && !allTags.includes(rawTag)) { next.delete('tag'); changed = true; }
    }
    if (changed) setSearchParams(next, { replace: true });
  }, [allTags, categories, filtersReady, searchParams, setSearchParams]);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params: GetProductsParams = { limit: LIMIT, page, sort: sortBy };
    if (debouncedSearch) params.query = debouncedSearch;
    if (categoryFilter !== 'all') params.category = categoryFilter;
    if (tagFilter) params.tag = tagFilter;
    if (featuredOnly) params.featured = true;

    getProducts(params)
      .then(result => {
        setProducts(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .finally(() => setLoading(false));
  }, [debouncedSearch, categoryFilter, tagFilter, featuredOnly, sortBy, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  function clearFilters() {
    setSearch('');
    syncingSearchFromUrl.current = true;
    setSearchParams(new URLSearchParams());
  }

  const hasActiveFilters = !!(debouncedSearch || categoryFilter !== 'all' || tagFilter || featuredOnly);

  // Build compact page list: always show first/last + ±1 around current
  const pageList = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
    .reduce<(number | 'ellipsis')[]>((acc, n, idx, arr) => {
      if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
      acc.push(n);
      return acc;
    }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <div className="container mx-auto px-4 py-8 flex-1">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">আমাদের পণ্যসমূহ</h1>
          {!loading && total > 0 && (
            <span className="text-sm text-muted-foreground">মোট পণ্য: {formatBanglaNumber(total)}</span>
          )}
        </div>

        {/* Primary filter row */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder="পণ্য খুঁজুন..."
              value={search}
              onChange={e => { syncingSearchFromUrl.current = false; setSearch(e.target.value); }}
              className="pl-10 bg-card"
            />
            {search && (
              <button aria-label="খোঁজার লেখা মুছুন" onClick={() => { syncingSearchFromUrl.current = true; setSearch(''); updateRouteParam('q', null, { replace: true }); }} className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground md:h-10 md:w-10">
                <X size={14} />
              </button>
            )}
          </div>

          <Select value={categoryFilter} onValueChange={(value) => updateRouteParam('category', value === 'all' ? null : value)}>
            <SelectTrigger className="w-full sm:w-44 bg-card">
              <SelectValue placeholder="ক্যাটাগরি" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">সব ক্যাটাগরি</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter || '__all__'} onValueChange={(value) => updateRouteParam('tag', value === '__all__' ? null : value)}>
            <SelectTrigger className="w-full sm:w-40 bg-card">
              <SelectValue placeholder="ট্যাগ" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">সব ট্যাগ</SelectItem>
              {allTags.map(t => (
                <SelectItem key={t} value={t}>#{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy ?? 'newest'} onValueChange={(value) => updateRouteParam('sort', value === 'newest' ? null : value)}>
            <SelectTrigger className="w-full sm:w-48 bg-card">
              <SelectValue placeholder="সর্ট করুন" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">নতুন আগে</SelectItem>
              <SelectItem value="oldest">পুরনো আগে</SelectItem>
              <SelectItem value="price_asc">দাম: কম → বেশি</SelectItem>
              <SelectItem value="price_desc">দাম: বেশি → কম</SelectItem>
              <SelectItem value="name_asc">নাম: ক → ঢ</SelectItem>
              <SelectItem value="name_desc">নাম: ঢ → ক</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Secondary row: featured toggle + active chips + clear */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <button
            onClick={() => updateRouteParam('featured', featuredOnly ? null : '1')}
            className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-all md:min-h-9 ${
              featuredOnly
                ? 'border-secondary bg-secondary/15 text-secondary font-medium'
                : 'border-border text-muted-foreground hover:border-secondary/50'
            }`}
          >
            <Star size={13} fill={featuredOnly ? 'currentColor' : 'none'} />
            ফিচার্ড পণ্য
          </button>

          {tagFilter && (
            <span className="flex min-h-11 items-center gap-1 rounded-full bg-secondary/15 px-3 text-sm font-medium text-secondary md:min-h-9">
              #{tagFilter}
              <button aria-label={`${tagFilter} ট্যাগ মুছুন`} onClick={() => updateRouteParam('tag', null)} className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-full hover:bg-background/60 hover:text-destructive">
                <X size={13} />
              </button>
            </span>
          )}

          {hasActiveFilters && (
            <button onClick={clearFilters} className="ml-auto min-h-11 rounded-md px-2 text-xs text-muted-foreground underline hover:bg-muted hover:text-destructive md:min-h-9">
              সব ফিল্টার মুছুন
            </button>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
            <Loader2 size={22} className="animate-spin" /> লোড হচ্ছে...
          </div>
        ) : products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                <Button aria-label="আগের পৃষ্ঠা" variant="outline" size="sm" className="min-w-11" onClick={() => updateRouteParam('page', page > 2 ? String(page - 1) : null, { resetPage: false })} disabled={page === 1}>
                  <ChevronLeft size={16} />
                </Button>

                {pageList.map((item, i) =>
                  item === 'ellipsis' ? (
                    <span key={`e${i}`} className="px-1 text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={item}
                      size="sm"
                      variant={page === item ? 'default' : 'outline'}
                      onClick={() => updateRouteParam('page', item === 1 ? null : String(item), { resetPage: false })}
                      className={`min-w-11 ${page === item ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90' : ''}`}
                    >
                      {formatBanglaNumber(item)}
                    </Button>
                  )
                )}

                <Button aria-label="পরের পৃষ্ঠা" variant="outline" size="sm" className="min-w-11" onClick={() => updateRouteParam('page', String(page + 1), { resetPage: false })} disabled={page === totalPages}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">কোনো পণ্য পাওয়া যায়নি</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 min-h-11 rounded-md px-3 text-sm text-secondary hover:bg-muted hover:underline">
                ফিল্টার মুছে আবার চেষ্টা করুন
              </button>
            )}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default Shop;
