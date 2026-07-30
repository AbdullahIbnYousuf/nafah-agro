const Footer = () => (
  <footer className="bg-primary text-primary-foreground mt-12">
    <div className="container mx-auto px-4 py-8">
      <div className="grid md:grid-cols-3 gap-8">
        <div>
          <h3 className="text-lg font-bold mb-3 text-accent">নাফাহ এগ্রো</h3>
          <p className="text-sm opacity-80">
            আমরা সরাসরি খামার থেকে আপনার ঘরে পৌঁছে দিই বিশুদ্ধ, অর্গানিক খাদ্যপণ্য।
          </p>
        </div>
        <div>
          <h3 className="text-lg font-bold mb-3 text-accent">লিংক</h3>
          <ul className="space-y-1 text-sm opacity-80">
            <li><a href="/" className="hover:text-accent transition-colors">হোম</a></li>
            <li><a href="/shop" className="hover:text-accent transition-colors">দোকান</a></li>
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-bold mb-3 text-accent">যোগাযোগ</h3>
          <p className="text-sm opacity-80">ফোন: ০১৭XXXXXXXX</p>
          <p className="text-sm opacity-80">ইমেইল: info@nafahagro.com</p>
        </div>
      </div>
      <div className="border-t border-secondary/30 mt-6 pt-4 text-center text-sm opacity-60">
        © {new Date().getFullYear()} নাফাহ এগ্রো। সর্বস্বত্ব সংরক্ষিত।
      </div>
    </div>
  </footer>
);

export default Footer;
