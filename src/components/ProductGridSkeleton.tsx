interface ProductGridSkeletonProps {
  count: number;
  columns?: 'featured' | 'shop';
}

export default function ProductGridSkeleton({ count, columns = 'shop' }: ProductGridSkeletonProps) {
  return (
    <div
      className={columns === 'featured'
        ? 'grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6'
        : 'grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4'}
      aria-label="পণ্য লোড হচ্ছে"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-lg border bg-card">
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="space-y-2 p-4">
            <div className="h-5 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
