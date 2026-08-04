const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">পৃষ্ঠা পাওয়া যায়নি</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          হোমে ফিরুন
        </a>
      </div>
    </div>
  );
};

export default NotFound;
