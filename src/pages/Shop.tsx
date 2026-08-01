import { useState, useEffect, useCallback } from 'react';
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

const LIMIT = 12;

const Shop = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<GetProductsParams['sort']>('newest');
  const [page, setPage] = useState(1);

  // Results
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const debouncedSearch = useDebounce(search, 350);

  // Load categories + tags once
  useEffect(() => {
    Promise.all([getCategories(), getProductTags()]).then(([cats, tags]) => {
      setCategories(cats);
      setAllTags(tags);
    });
  }, []);

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

  // Reset to page 1 whenever a filter changes
  useEffect(() => { setPage(1); }, [debouncedSearch, categoryFilter, tagFilter, featuredOnly, sortBy]);

  function clearFilters() {
    setSearch('');
    setCategoryFilter('all');
    setTagFilter('');
    setFeaturedOnly(false);
    setSortBy('newest');
    setPage(1);
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">আমাদের পণ্যসমূহ</h1>
          {!loading && total > 0 && (
            <span className="text-sm text-muted-foreground">{total}টি পণ্য</span>
          )}
        </div>

        {/* Primary filter row */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder="পণ্য খুঁজুন..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 bg-card"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-44 bg-card">
              <SelectValue placeholder="ক্যাটাগরি" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">সব ক্যাটাগরি</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={tagFilter || '__all__'} onValueChange={v => setTagFilter(v === '__all__' ? '' : v)}>
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

          <Select value={sortBy ?? 'newest'} onValueChange={v => setSortBy(v as GetProductsParams['sort'])}>
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
            onClick={() => setFeaturedOnly(f => !f)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-all ${
              featuredOnly
                ? 'border-secondary bg-secondary/15 text-secondary font-medium'
                : 'border-border text-muted-foreground hover:border-secondary/50'
            }`}
          >
            <Star size={13} fill={featuredOnly ? 'currentColor' : 'none'} />
            ফিচার্ড পণ্য
          </button>

          {tagFilter && (
            <span className="flex items-center gap-1 text-sm bg-secondary/15 text-secondary px-3 py-1.5 rounded-full font-medium">
              #{tagFilter}
              <button onClick={() => setTagFilter('')} className="hover:text-destructive ml-0.5">
                <X size={13} />
              </button>
            </span>
          )}

          {hasActiveFilters && (
            <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-destructive underline ml-auto">
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
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
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
                      onClick={() => setPage(item as number)}
                      className={page === item ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90' : ''}
                    >
                      {item}
                    </Button>
                  )
                )}

                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg">কোনো পণ্য পাওয়া যায়নি</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-sm text-secondary hover:underline">
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
