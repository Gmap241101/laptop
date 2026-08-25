import React from 'react';

export default function UserSectionHero({ title, description }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-6 py-10 text-white">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-16 left-10 h-44 w-44 rounded-full bg-orange-400/20 blur-3xl" />
      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
          {description}
        </p>
      </div>
    </div>
  );
}
