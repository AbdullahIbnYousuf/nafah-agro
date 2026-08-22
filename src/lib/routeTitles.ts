const SITE_NAME = 'নাফাহ এগ্রো';

export function titleForPath(pathname: string) {
  if (pathname === '/') return `হোম | ${SITE_NAME}`;
  if (pathname === '/shop') return `দোকান | ${SITE_NAME}`;
  if (pathname.startsWith('/products/')) return `পণ্য | ${SITE_NAME}`;
  if (pathname === '/cart') return `কার্ট | ${SITE_NAME}`;
  if (pathname === '/login') return `লগইন | ${SITE_NAME}`;
  if (pathname === '/register') return `রেজিস্ট্রেশন | ${SITE_NAME}`;
  if (pathname === '/reset-password') return `পাসওয়ার্ড পরিবর্তন | ${SITE_NAME}`;
  if (pathname === '/profile') return `প্রোফাইল | ${SITE_NAME}`;
  if (pathname === '/admin/dashboard' || pathname === '/admin') return `ড্যাশবোর্ড | ${SITE_NAME}`;
  if (pathname.startsWith('/admin/products/')) {
    if (pathname.endsWith('/edit')) return `পণ্য সম্পাদনা | ${SITE_NAME}`;
    if (pathname.endsWith('/variants')) return `প্যাক/সাইজ ও দাম | ${SITE_NAME}`;
    if (pathname.endsWith('/new')) return `নতুন পণ্য | ${SITE_NAME}`;
  }
  if (pathname === '/admin/products') return `পণ্য | ${SITE_NAME}`;
  if (pathname === '/admin/categories') return `ক্যাটাগরি | ${SITE_NAME}`;
  if (pathname === '/admin/inventory') return `ক্রয় ও ইনভেন্টরি | ${SITE_NAME}`;
  if (pathname === '/admin/physical-sales') return `দোকানের বিক্রি | ${SITE_NAME}`;
  if (pathname === '/admin/dues') return `বাকি হিসাব | ${SITE_NAME}`;
  if (pathname === '/admin/orders') return `অর্ডার | ${SITE_NAME}`;
  if (pathname.startsWith('/admin/')) return `পরিচালনা পৃষ্ঠা পাওয়া যায়নি | ${SITE_NAME}`;
  return `পৃষ্ঠা পাওয়া যায়নি | ${SITE_NAME}`;
}
