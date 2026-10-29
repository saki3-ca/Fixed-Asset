'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { QrCode, MapPin, PlusCircle, CheckSquare, BarChart3 } from 'lucide-react';

export const MobileNavBar: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Scan / Count',
      href: '/count',
      icon: QrCode,
    },
    {
      label: 'Locations',
      href: '/locations',
      icon: MapPin,
    },
    {
      label: 'Not in FAR',
      href: '/found-not-in-far',
      icon: PlusCircle,
    },
    {
      label: 'Review',
      href: '/review',
      icon: CheckSquare,
    },
    {
      label: 'Summary',
      href: '/dashboard',
      icon: BarChart3,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-cream-card border-t border-slate-300 shadow-lg pb-safe">
      <div className="grid grid-cols-5 max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center min-h-[56px] py-1.5 transition-colors ${
                isActive
                  ? 'text-brand-700 font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`p-1 rounded-full transition-transform ${
                  isActive ? 'bg-brand-50 scale-110 text-brand-700' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight text-center leading-tight">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

