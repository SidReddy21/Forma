import React, { useMemo } from 'react';
import { useCollaborationStore } from '../store/collaborationStore';
import { useUserStore } from '../store/userStore';
import { Users } from 'lucide-react';
import { motion } from 'framer-motion';

// Array of vibrant, distinct colors for users
const USER_COLORS = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // violet
];

function getUserColor(userId: string): string {
  // Generate consistent color based on userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

export function CollaborativePanel() {
  const { collaborators } = useCollaborationStore();
  const { username, userId } = useUserStore();

  // Combine current user with collaborators into a single list
  const allUsers = useMemo(() => {
    const currentUser = {
      id: userId,
      username,
      color: getUserColor(userId),
      cursor: { line: 0, column: 0 },
      isActive: true,
      lastSeen: Date.now(),
      isCurrentUser: true,
    };

    // Guard against undefined collaborators and filter out duplicates of current user
    const otherUsers = (collaborators || [])
      .filter(user => user && user.id && user.id !== userId) // Extra safety: exclude current user
      .map(user => ({
        ...user,
        color: getUserColor(user.id),
        isCurrentUser: false,
      }));

    return [currentUser, ...otherUsers];
  }, [username, userId, collaborators]);

  return (
    <div className="space-y-4">
      {/* Active Users */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-purple-400" />
          <h3 className="font-semibold">Active Users ({allUsers.length})</h3>
        </div>
        <div className="space-y-2">
          {allUsers.map((user) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-3 p-3 rounded border transition-colors ${
                user.isCurrentUser 
                  ? 'bg-blue-900/30 border-blue-500' 
                  : 'bg-slate-700 border-slate-600 hover:border-slate-500'
              }`}
            >
              <div
                className="w-4 h-4 rounded-full shadow-lg"
                style={{ backgroundColor: user.color }}
                title={user.username}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.username}
                  {user.isCurrentUser && <span className="text-blue-400 ml-1">(You)</span>}
                </p>
                {!user.isCurrentUser && (
                  <p className="text-xs text-slate-500">Line {user.cursor.line + 1}</p>
                )}
              </div>
              {user.isActive && !user.isCurrentUser && (
                <span className="text-xs text-green-400 font-semibold">● Active</span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
