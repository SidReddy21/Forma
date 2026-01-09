import React, { useEffect, useState } from 'react';
import { useCollaborationStore } from '../store/collaborationStore';
import { Users, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

export function CollaborativePanel() {
  const { collaborators, stats } = useCollaborationStore();

  return (
    <div className="space-y-4">
      {/* Active Users */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-blue-400" />
          <h3 className="font-semibold">Collaborators ({collaborators.length})</h3>
        </div>
        <div className="space-y-2">
          {collaborators.length === 0 ? (
            <p className="text-sm text-slate-500">Waiting for collaborators...</p>
          ) : (
            collaborators.map((user) => (
              <motion.div
                key={user.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 p-2 bg-slate-700 rounded"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: user.color }}
                />
                <span className="text-sm">{user.username}</span>
                {user.isActive && (
                  <span className="ml-auto text-xs text-green-400">●</span>
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
        <div className="space-y-1 text-sm text-slate-400">
          <p>Changes: {stats.changeCount}</p>
          <p>Session Time: {stats.sessionTime}s</p>
          <p>Active Users: {collaborators.filter((u) => u.isActive).length}</p>
        </div>
      </div>
    </div>
  );
}
