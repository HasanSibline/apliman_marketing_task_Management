import { useState } from 'react'
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid'
import ApliChat from './ApliChat'

export default function FloatingChatButton() {
  const [isChatOpen, setIsChatOpen] = useState(false)

  return (
    <>
      {/* Floating chat button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transform hover:scale-110 transition-all duration-200 flex items-center justify-center z-40 group"
          title="Open ApliChat"
        >
          <ChatBubbleLeftRightIcon className="w-8 h-8" />
          
          {/* Pulse animation */}
          <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span>
          
          {/* Tooltip */}
          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block">
            <div className="bg-gray-900 text-white text-sm rounded-lg py-2 px-3 whitespace-nowrap">
              Chat with ApliChat
              <div className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </button>
      )}

      {/* Chat window */}
      <ApliChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </>
  )
}

