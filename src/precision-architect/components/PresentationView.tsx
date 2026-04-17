import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Minimize2,
  MoreVertical,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'motion/react';
import { ViewMode } from '../types';
import { cn } from '@/lib/utils';
import PAEChart from './PAEChart';

interface PresentationViewProps {
  onViewModeChange: (mode: ViewMode) => void;
}

export default function PresentationView({ onViewModeChange }: PresentationViewProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(33);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 100 ? prev + 0.5 : 0));
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying]);

  return (
    <div className="h-screen w-full bg-[#0a0c0d] text-white flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-10 opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-primary/20 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-teal-500/10 blur-[200px] rounded-full" />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <header className="flex justify-between items-center w-full px-12 py-8 z-50">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(0,104,95,0.8)]" />
          <h1 className="text-2xl font-black tracking-tight text-white uppercase font-headline">Precision Architect</h1>
          <span className="ml-4 px-3 py-1 rounded-full bg-primary/20 text-primary text-[10px] font-black tracking-[0.2em] uppercase border border-primary/20">Live P+ View</span>
        </div>

        <div className="flex items-center gap-8">
          <div className="text-right">
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">Global Network Status</p>
            <p className="text-lg font-bold text-white flex items-center gap-2 justify-end">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Operational
            </p>
          </div>
          <button
            onClick={() => onViewModeChange('view')}
            className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all active:scale-95"
          >
            <Minimize2 className="w-6 h-6 text-white" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full px-12 flex flex-col justify-center gap-12 relative max-w-[1800px] mx-auto">
        <div className="w-full flex flex-col gap-8">
          <div className="flex justify-between items-end">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <h2 className="text-7xl font-black text-white tracking-tighter mb-4 font-headline uppercase">Global Throughput</h2>
              <p className="text-xl text-zinc-400 font-medium max-w-2xl">Real-time aggregate data flow across 14 global nodes, monitored with millisecond precision.</p>
            </motion.div>

            <div className="flex gap-6">
              {[
                { label: 'Peak Rate', value: '1.42', unit: 'Tb/s' },
                { label: 'Current Active', value: '892', unit: 'Gb/s', active: true },
              ].map((stat) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "glass-panel-dark px-8 py-6 rounded-2xl text-center min-w-[200px]",
                    stat.active && "border-l-4 border-l-primary"
                  )}
                >
                  <p className="text-[10px] text-primary uppercase tracking-[0.2em] mb-2 font-black">{stat.label}</p>
                  <p className="text-5xl font-black text-white font-headline">
                    {stat.value} <span className="text-xl font-normal text-zinc-500 ml-1 decoration-none">{stat.unit}</span>
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="h-[520px] w-full rounded-3xl relative overflow-hidden bg-white/5 border border-white/5 backdrop-blur-sm group p-6">
            <div className="absolute inset-0 flex items-end justify-between px-2 opacity-10 pointer-events-none">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="w-px h-full bg-white" />
              ))}
            </div>

            <PAEChart variant="presentation" height="100%" />

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute left-[58%] top-[35%] glass-panel-dark p-5 rounded-2xl flex items-center gap-5 border border-primary/30 shadow-2xl z-20"
            >
              <div className="w-3 h-3 rounded-full bg-primary-fixed-dim shadow-[0_0_12px_rgba(107,216,203,0.8)]" />
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-black">Node: Frankfurt-A</p>
                <p className="text-lg font-bold text-white font-headline">412.5 <span className="text-sm font-normal text-zinc-500">Gb/s</span></p>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-8 w-full">
          {[
            { label: 'Network Latency', value: '12', unit: 'ms', progress: 75, color: 'bg-primary' },
            { label: 'Error Rate', value: '0.02', unit: '%', progress: 10, color: 'bg-tertiary' },
            { label: 'Active Nodes', value: '142', unit: '/ 144', extra: 'High Availability', color: 'bg-primary' },
            { label: 'Packet Loss', value: '0.00', unit: 'μ', status: 'optimal', color: 'bg-primary' },
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + idx * 0.1 }}
              className="glass-panel-dark p-8 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group"
            >
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] mb-3 font-black">{item.label}</p>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-4xl font-bold text-white font-headline tracking-tighter">{item.value}</span>
                <span className="text-lg text-primary font-medium">{item.unit}</span>
              </div>

              {item.progress !== undefined ? (
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${item.progress}%` }} className={cn('h-full', item.color)} />
                </div>
              ) : item.extra ? (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-xs text-primary font-bold uppercase tracking-widest">{item.extra}</span>
                </div>
              ) : (
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={cn('w-full h-full shadow-[0_0_12px_rgba(0,104,95,0.6)]', item.color)} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </main>

      <footer className="w-full px-12 py-10 flex flex-col items-center gap-6 z-50 mt-auto">
        <div className="w-full max-w-5xl h-1 bg-zinc-800 rounded-full overflow-hidden">
          <motion.div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex justify-between items-center w-full max-w-7xl">
          <div className="flex items-center gap-4">
            <button className="w-14 h-14 rounded-full glass-panel-dark flex items-center justify-center hover:bg-white/10 transition-all active:scale-90">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-center px-6">
              <p className="text-sm font-black text-white uppercase tracking-tighter">Slide 04</p>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">of 12</p>
            </div>
            <button className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center hover:scale-110 active:scale-90 shadow-xl shadow-primary/40 transition-all">
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center gap-4 px-3 py-2 glass-panel-dark rounded-full">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-8 py-3 rounded-full bg-primary text-white text-xs font-black uppercase tracking-[0.2em] flex items-center gap-3 active:scale-95 transition-all shadow-lg shadow-primary/20"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              {isPlaying ? 'Playback' : 'Paused'}
            </button>
            <button className="px-6 py-3 rounded-full text-zinc-400 text-xs font-black uppercase tracking-[0.2em] hover:text-white transition-colors">Insights</button>
            <button className="px-6 py-3 rounded-full text-zinc-400 text-xs font-black uppercase tracking-[0.2em] hover:text-white transition-colors">Topology</button>
          </div>

          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold mb-1">Next Topic</p>
              <p className="text-sm font-bold text-white uppercase tracking-tight">Security Perimeter</p>
            </div>
            <button className="p-2 text-zinc-500 hover:text-white transition-colors">
              <MoreVertical className="w-6 h-6" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
