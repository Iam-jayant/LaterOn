import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Calculator } from "@/components/landing/Calculator";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import { TrustSection } from "@/components/landing/TrustSection";
import { Footer } from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <HowItWorks />
      <Calculator />
      <DashboardPreview />
      <TrustSection />
      <Footer />
    </>
  );
}
