import { useEffect, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Link, NavLink } from "react-router";
import Logo from "./Logo";

export default function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    const navlinks = [
        {
            href: "/csv",
            text: "CSV Audit",
        },
        {
            href: "/table",
            text: "Table Audit",
        },
        {
            href: "/api",
            text: "API Audit",
        },
        {
            href: "/chat",
            text: "AI Chat",
        },
    ];
    return (
        <>
            <motion.nav className={`sticky top-0 z-50 flex items-center justify-between w-full h-18 px-6 md:px-16 lg:px-24 xl:px-32 backdrop-blur-md transition-colors duration-300 border-b ${scrolled ? "bg-black/60 border-white/10" : "bg-transparent border-transparent"}`}
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 250, damping: 70, mass: 1 }}
            >
                <Link to="/" aria-label="Assay home">
                    <Logo />
                </Link>

                <div className="hidden lg:flex items-center gap-8 transition duration-500">
                    {navlinks.map((link) => (
                        <NavLink key={link.href} to={link.href} className={({ isActive }) => `relative py-1 text-sm font-medium transition ${isActive ? "text-white after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-indigo-500" : "text-slate-400 hover:text-slate-100"}`}>
                            {link.text}
                        </NavLink>
                    ))}
                </div>

                <div className="hidden lg:block space-x-3">
                    <button 
                        onClick={() => navigate('/csv')}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 transition text-white rounded-full text-sm font-bold active:scale-95 shadow-lg shadow-indigo-600/20"
                    >
                        New Audit
                    </button>
                </div>
                <button onClick={() => setIsMenuOpen(true)} className="lg:hidden active:scale-90 transition">
                    <MenuIcon className="size-6.5" />
                </button>
            </motion.nav>
            <div className={`fixed inset-0 z-[100] bg-black/60 backdrop-blur flex flex-col items-center justify-center text-lg gap-8 lg:hidden transition-transform duration-400 ${isMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
                {navlinks.map((link) => (
                    <Link key={link.href} to={link.href} onClick={() => setIsMenuOpen(false)}>
                        {link.text}
                    </Link>
                ))}
                <button onClick={() => setIsMenuOpen(false)} className="active:ring-3 active:ring-white aspect-square size-10 p-1 items-center justify-center bg-slate-100 hover:bg-slate-200 transition text-black rounded-md flex">
                    <XIcon />
                </button>
            </div>
        </>
    );
}