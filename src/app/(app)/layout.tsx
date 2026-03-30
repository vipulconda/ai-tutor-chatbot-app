"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", icon: "🏠", label: "Home" },
  { href: "/chat", icon: "💬", label: "Chat" },
  { href: "/quiz", icon: "🧩", label: "Quiz" },
  { href: "/progress", icon: "📊", label: "Progress" },
  { href: "/settings", icon: "⚙️", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show bottom nav on chat detail pages
  const isChatDetail = pathname.startsWith("/chat/");

  return (
    <>
      {children}
      {!isChatDetail && (
        <nav className="bottom-nav" id="bottom-navigation">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "active"
                  : ""
              }`}
              id={`nav-${item.label.toLowerCase()}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
