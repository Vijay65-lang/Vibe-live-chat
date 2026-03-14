import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { MessageData } from './ChatRoom';
import { Trash2, Star, Shield, Award, Zap } from 'lucide-react';

interface ChatMessageProps {
  message: MessageData;
  isOwn: boolean;
  isSequential: boolean;
  onReact: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string) => void;
  onHighlight?: (messageId: string) => void;
  currentUserId: string;
}

const EMOJIS = ['👍', '😂', '🔥', '❤️', '😮'];

// Use React.memo to prevent re-rendering all messages when a new one is added
export const ChatMessage = memo(function ChatMessage({ message, isOwn, isSequential, onReact, onDelete, onHighlight, currentUserId }: ChatMessageProps) {
  const { id, text, displayName, photoURL, createdAtMs, reactions, level, isHighlighted } = message;
  const [showReactions, setShowReactions] = useState(false);

  const timeString = createdAtMs 
    ? formatDistanceToNow(createdAtMs, { addSuffix: true }) 
    : 'just now';

  // Determine badge based on level
  const getBadge = (lvl?: number) => {
    if (!lvl) return null;
    if (lvl >= 20) return <span className="flex items-center gap-1 text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full"><Award className="w-3 h-3" /> Legend</span>;
    if (lvl >= 10) return <span className="flex items-center gap-1 text-[10px] bg-fuchsia-500/20 text-fuchsia-400 px-1.5 py-0.5 rounded-full"><Zap className="w-3 h-3" /> Active</span>;
    if (lvl >= 5) return <span className="flex items-center gap-1 text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full"><Shield className="w-3 h-3" /> Friendly</span>;
    return null;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isSequential ? 'mt-1' : 'mt-4'} group`}
      onMouseEnter={() => setShowReactions(true)}
      onMouseLeave={() => setShowReactions(false)}
    >
      <div className={`flex max-w-[85%] sm:max-w-[75%] gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'} relative`}>
        {/* Avatar */}
        {!isOwn && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden bg-zinc-800">
            {!isSequential ? (
              <img src={photoURL} alt={displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full bg-transparent"></div>
            )}
          </div>
        )}

        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} relative`}>
          {/* Name & Time */}
          {!isSequential && !isOwn && (
            <div className="flex items-center gap-2 mb-1 ml-1">
              <span className="text-xs font-semibold text-zinc-300">{displayName}</span>
              {getBadge(level)}
              <span className="text-[10px] text-zinc-500">{timeString}</span>
            </div>
          )}

          {/* Bubble */}
          <div className="relative">
            <div
              className={`px-4 py-2 rounded-2xl text-sm transition-colors ${
                isHighlighted 
                  ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/50 text-yellow-100 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                  : isOwn
                    ? 'bg-fuchsia-600 text-white rounded-tr-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
            </div>

            {/* Reaction Picker (Hover) */}
            <AnimatePresence>
              {showReactions && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`absolute -top-10 ${isOwn ? 'right-0' : 'left-0'} bg-zinc-800 border border-zinc-700 rounded-full shadow-lg p-1 flex gap-1 z-10`}
                >
                  {EMOJIS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => onReact(id, emoji)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-zinc-700 rounded-full transition-colors text-lg"
                    >
                      {emoji}
                    </button>
                  ))}
                  {onHighlight && (
                    <button
                      onClick={() => onHighlight(id)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-zinc-700 rounded-full transition-colors text-yellow-500"
                      title="Highlight Message"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  {isOwn && onDelete && (
                    <button
                      onClick={() => onDelete(id)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-zinc-700 rounded-full transition-colors text-red-500"
                      title="Delete Message"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Display Reactions */}
          {reactions && Object.keys(reactions).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {Object.entries(reactions).map(([emoji, users]) => {
                const userArray = users as string[];
                if (userArray.length === 0) return null;
                const hasReacted = userArray.includes(currentUserId);
                
                return (
                  <button
                    key={emoji}
                    onClick={() => onReact(id, emoji)}
                    className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                      hasReacted 
                        ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-300' 
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <span>{emoji}</span>
                    <span>{userArray.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});
