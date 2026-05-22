/**
 * progress-store.js
 *
 * localStorage 기반 진도 저장.
 *
 *  ProgressStore.load() → { lastChapter, visited: {chId:true}, completed: {chId:true}, exercises: {chId:[exId,...]} }
 *  ProgressStore.save(p)
 *  ProgressStore.markVisited(chapterId)
 *  ProgressStore.markCompleted(chapterId)
 *  ProgressStore.markExerciseDone(chapterId, exerciseId)
 *  ProgressStore.isExerciseDone(chapterId, exerciseId)
 *  ProgressStore.reset()
 *  ProgressStore.completedCount() → 완료 챕터 수
 *  ProgressStore.visitedCount()
 */
(function (global) {
  'use strict';

  const KEY = 'pokemon-ontology-progress-v1';

  function _safeRead() {
    try {
      return JSON.parse(global.localStorage.getItem(KEY) || '{}');
    } catch (e) { return {}; }
  }

  const ProgressStore = {
    load() {
      const p = _safeRead();
      p.visited = p.visited || {};
      p.completed = p.completed || {};
      p.exercises = p.exercises || {};
      return p;
    },
    save(p) {
      try {
        global.localStorage.setItem(KEY, JSON.stringify(p));
      } catch (e) { /* quota / private mode */ }
    },
    markVisited(chapterId) {
      const p = this.load();
      p.visited[chapterId] = true;
      p.lastChapter = chapterId;
      this.save(p);
      return p;
    },
    markCompleted(chapterId) {
      const p = this.load();
      p.completed[chapterId] = true;
      this.save(p);
      return p;
    },
    markExerciseDone(chapterId, exerciseId) {
      const p = this.load();
      p.exercises[chapterId] = p.exercises[chapterId] || [];
      if (!p.exercises[chapterId].includes(exerciseId)) {
        p.exercises[chapterId].push(exerciseId);
      }
      this.save(p);
      return p;
    },
    isExerciseDone(chapterId, exerciseId) {
      const p = this.load();
      return (p.exercises[chapterId] || []).includes(exerciseId);
    },
    reset() {
      try { global.localStorage.removeItem(KEY); } catch (e) { /* noop */ }
    },
    completedCount() {
      return Object.keys(this.load().completed || {}).length;
    },
    visitedCount() {
      return Object.keys(this.load().visited || {}).length;
    }
  };

  global.ProgressStore = ProgressStore;
})(typeof window !== 'undefined' ? window : globalThis);
