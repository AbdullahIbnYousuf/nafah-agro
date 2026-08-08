import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  MapPin,
  Leaf,
  Truck,
  ShieldCheck,
  Loader2,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import heroBg from "@/assets/hero-bg.jpg";
import ProductCard from "@/components/ProductCard";
import { getProducts } from "@/lib/api";
import { Product } from "@/lib/types";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  BUSINESS_ADDRESS,
  BUSINESS_PHONES,
  GOOGLE_MAP_URL,
} from "@/lib/contact";

const features = [
  {
    icon: Leaf,
    title: "১০০% অর্গানিক",
    desc: "কোনো কেমিক্যাল বা কীটনাশক ব্যবহার করা হয় না",
  },
  {
    icon: Truck,
    title: "হোম ডেলিভারি",
    desc: "সরাসরি খামার থেকে আপনার দোরগোড়ায়",
  },
  {
    icon: ShieldCheck,
    title: "গুণগত মান নিশ্চিত",
    desc: "প্রতিটি পণ্য যত্ন সহকারে বাছাই করা",
  },
];

const Index = () => {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts({ featured: true, limit: 4 })
      .then((page) => setFeatured(page.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBg}
            alt="নাফাহ এগ্রো"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-primary/70" />
        </div>
        <div className="relative container mx-auto px-4 py-24 md:py-36 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-primary-foreground mb-4 animate-fade-in">
            নাফাহ এগ্রো
          </h1>
          <p
            className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-8 animate-fade-in"
            style={{ animationDelay: "0.15s" }}
          >
            সরাসরি খামার থেকে আপনার পরিবারের জন্য বিশুদ্ধ, অর্গানিক খাদ্যপণ্য।
            স্বাস্থ্যকর জীবনের জন্য প্রকৃতির সেরা উপহার।
          </p>
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in"
            style={{ animationDelay: "0.3s" }}
          >
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base px-8"
            >
              <Link to="/shop">
                <ShoppingBag className="mr-2" size={20} />
                অনলাইনে কিনুন
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground font-semibold text-base px-8"
            >
              <a
                href={GOOGLE_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPin className="mr-2" size={20} />
                আমাদের দোকানে আসুন
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <div key={i} className="text-center p-6 rounded-lg">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-secondary/10 flex items-center justify-center">
                  <f.icon size={28} className="text-secondary" />
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">জনপ্রিয় পণ্য</h2>
            <p className="text-muted-foreground mt-2">
              আমাদের সবচেয়ে বেশি বিক্রিত পণ্যসমূহ
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" /> লোড হচ্ছে...
            </div>
          ) : featured.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              এখনো কোনো ফিচার্ড পণ্য নেই
            </p>
          )}
          <div className="text-center mt-8">
            <Button
              asChild
              variant="outline"
              className="border-secondary text-secondary hover:bg-secondary hover:text-secondary-foreground"
            >
              <Link to="/shop">সব পণ্য দেখুন →</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-card py-16" aria-labelledby="contact-heading">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h2 id="contact-heading" className="text-3xl font-bold">
              যোগাযোগ করুন
            </h2>
            <p className="mt-2 text-muted-foreground">
              পণ্য সম্পর্কে জানতে ফোন করুন অথবা সরাসরি আমাদের দোকানে আসুন
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
            <a
              href={GOOGLE_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-32 items-start gap-4 rounded-xl border bg-background p-5 transition-colors hover:border-secondary"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <MapPin size={22} aria-hidden="true" />
              </span>
              <span className="text-left">
                <strong className="block">আমাদের ঠিকানা</strong>
                <span className="mt-2 block text-sm text-muted-foreground">
                  {BUSINESS_ADDRESS}
                </span>
                <span className="mt-2 block text-sm font-semibold text-secondary">
                  Google Maps-এ দেখুন
                </span>
              </span>
            </a>
            <div className="flex min-h-32 items-start gap-4 rounded-xl border bg-background p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <Phone size={22} aria-hidden="true" />
              </span>
              <div className="text-left">
                <strong className="block">ফোন নম্বর</strong>
                <div className="mt-2 flex flex-col gap-1">
                  {BUSINESS_PHONES.map((phone) => (
                    <a
                      key={phone}
                      href={`tel:${phone}`}
                      className="inline-flex min-h-9 items-center font-semibold text-secondary hover:underline"
                    >
                      {phone}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Index;
