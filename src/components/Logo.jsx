import React from 'react'

export default function Logo({ className = '' }) {
  return (
    <div className={`flex items-center ${className}`}>
      <span
        className="font-['Syne'] font-bold text-black dark:text-white"
        style={{ letterSpacing: '0px' }}
      >
        pium
      </span>
      <span
        className="w-[10px] h-[10px] bg-[#a855f7] rounded-full ml-1 mb-[10px]"
        style={{ boxShadow: '0 0 16px rgba(168, 85, 247, 0.67)' }}
      ></span>
    </div>
  )
}