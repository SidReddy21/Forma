import React from 'react';
import { useCollaborationStore } from '../store/collaborationStore';
import { useUserStore } from '../store/userStore';
import { Users, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export function CollaborativePanel() {
  const { collaborators, stats } = useCollaborationStore();
  const { username } = useUserStore();

  return (
    <div className="space-y-4">
      {/* Current User */}
      <div className="bg-blue-900/30 border border-blue-500 p-3 rounded">
        <p className="text-sm text-blue-200">
          <span className="font-semibold">You:</span> {username}
        </p>
      </div>

      {/* Active Users */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-purple-400" />
          <h3 className="font-semibold">Collaborators ({collaborators.length})</h3>
        </div>
        <div className="space-y-2">
          {collaborators.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Waiting for collaborators to join...</p>
          ) : (
            collaborators.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-3 bg-slate-700 rounded border border-slate-600 hover:border-slate-500 transition-colors"
              >
                <div
                  className="w-4 h-4 rounded-full shadow-lg"
                  style={{ backgroundColor: user.color }}
                  title={user.username}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.username}</p>
                  <p className="text-xs text-slate-500">Line {user.cursor.line + 1}</p>
                </div>
                {user.isActive && (
                  <span className="text-xs text-green-400 font-semibold">● Active</span>
                )}
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="border-t border-slate-700 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={18} className="text-yellow-400" />
          <h3 className="font-semibold">Session Stats</h3>
        </div>
        <div className="space-y-2 text-sm text-slate-400 bg-slate-800 p-3 rounded">
          <div className="flex justify-between">
            <span>Changes:</span>
            <span className="font-semibold text-slate-200">{stats.changeCount}</span>
          </div>
          <div className="flex justify-between">
            <span>Session Time:</span>
            <span className="font-semibold text-slate-200">{stats.sessionTime}s</span>
          </div>
          <div className="flex justify-between">
            <span>Active Users:</span>
            <span className="font-semibold text-slate-200">{collaborators.filter((u) => u.isActive).length + 1}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
