"use client"

import { useEffect } from "react"
import { Minus, Square, X } from "lucide-react"

export default function Titlebar() {
  useEffect(() => {
    const minBtn = document.getElementById("min-btn")
    const maxBtn = document.getElementById("max-btn")
    const closeBtn = document.getElementById("close-btn")

    minBtn?.addEventListener("click", () => window.electronAPI?.minimize())
    maxBtn?.addEventListener("click", () => window.electronAPI?.maximize())
    closeBtn?.addEventListener("click", () => window.electronAPI?.close())
  }, [])

  return (
    <div className="custom-titlebar flex justify-between items-center px-4 py-1 bg-gray-800 text-white select-none draggable">
      <span className="font-bold text-sm">MeetingAI</span>
      <div className="flex gap-2 non-draggable">
        <button id="min-btn" className="hover:bg-gray-600 px-2 py-1 rounded"><Minus size={14} /></button>
        <button id="max-btn" className="hover:bg-gray-600 px-2 py-1 rounded"><Square size={14} /></button>
        <button id="close-btn" className="hover:bg-red-600 px-2 py-1 rounded"><X size={14} /></button>
      </div>
    </div>
  )
}
