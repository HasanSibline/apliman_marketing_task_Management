import { useState } from 'react'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid'
import ApliChat from './ApliChat'

export default function FloatingChatButton() {
  const [isChatOpen, setIsChatOpen] = useState(false)

  return (
    <>
      {/* Floating chat button - Professional */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary-600 text-white rounded-xl shadow-xl hover:shadow-2xl hover:bg-primary-700 transform hover:scale-105 transition-all duration-300 flex items-center justify-center z-40 group"
          title="Open ApliChat AI"
        >
          <ChatBubbleLeftRightIcon className="w-7 h-7 relative z-10" />
          
          {/* Pulse animation */}
          <span className="absolute inline-flex h-full w-full rounded-xl bg-primary-400 opacity-75 animate-ping"></span>
          
          {/* Tooltip - Professional */}
          <div className="absolute bottom-full right-0 mb-3 hidden group-hover:block animate-fade-in">
            <div className="bg-gray-900 text-white text-sm rounded-lg py-2 px-4 whitespace-nowrap shadow-xl">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-success-400 rounded-full animate-pulse"></span>
                Chat with ApliChat AI
              </span>
              <div className="absolute top-full right-4 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </button>
      )}

      {/* Chat window */}
      <ApliChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </>
  )
}

