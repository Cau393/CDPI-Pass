import { Facebook, Instagram, Linkedin, Youtube } from "lucide-react";
import ContactChannels from "@/components/ContactChannels";

const SOCIAL_LINKS = [
  {
    href: "https://www.facebook.com/cdpipharma/",
    label: "Facebook da CDPI Pharma",
    Icon: Facebook,
  },
  {
    href: "https://www.instagram.com/cdpipharma/",
    label: "Instagram da CDPI Pharma",
    Icon: Instagram,
  },
  {
    href: "https://www.linkedin.com/company/cdpi-pharma/",
    label: "LinkedIn da CDPI Pharma",
    Icon: Linkedin,
  },
  {
    href: "https://www.youtube.com/@cdpimoving",
    label: "YouTube da CDPI Pharma",
    Icon: Youtube,
  },
] as const;

export default function SiteFooter() {
  return (
    <footer className="bg-primary text-white" data-testid="site-footer">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <img
                src="/LOGO-FACULDADE-CDPI-BRANCA.png"
                alt="CDPI Faculdade Logo"
                className="h-14 w-auto"
              />
            </div>
            <p className="text-white/80 text-sm">
              CDPI Faculdade. Todos os direitos
              <br />
              reservados ©️ 2025 CNPJ: 40.082.785/0001-03
              <br />
              Rua 115, Setor Sul, Golania-GO
            </p>
          </div>

          <div className="text-center">
            <h3 className="font-bold mb-3">Fale conosco</h3>
            <ContactChannels variant="footer" />
            <p className="text-sm text-white/80 mt-3">
              Entre em contato conosco
              <br />
              e tire suas dúvidas
            </p>
          </div>

          <div className="text-center md:text-right">
            <div className="flex justify-center md:justify-end space-x-3 mb-4">
              {SOCIAL_LINKS.map(({ href, label, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors min-h-11 min-w-11 inline-flex items-center justify-center"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
