import React, { useState } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ClarifyQuestion {
  id: string;
  question: string;
  options: { value: string; label: string; icon?: string }[];
  multiSelect?: boolean;
}

interface AIClarifyingQuestionsProps {
  questions: ClarifyQuestion[];
  onSubmit: (answers: Record<string, string[]>) => void;
  onSkip: () => void;
}

const AIClarifyingQuestions: React.FC<AIClarifyingQuestionsProps> = ({ questions, onSubmit, onSkip }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});

  const current = questions[currentStep];
  const selectedValues = answers[current?.id] || [];

  const toggleValue = (val: string) => {
    const qId = current.id;
    if (current.multiSelect) {
      setAnswers(prev => {
        const curr = prev[qId] || [];
        return { ...prev, [qId]: curr.includes(val) ? curr.filter(v => v !== val) : [...curr, val] };
      });
    } else {
      setAnswers(prev => ({ ...prev, [qId]: [val] }));
    }
  };

  const next = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      onSubmit(answers);
    }
  };

  const isLast = currentStep === questions.length - 1;
  const canProceed = selectedValues.length > 0;

  return (
    <div className="bg-muted/30 border border-border/60 rounded-xl p-3 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Progress */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-primary" />
          <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Configuration assistée</span>
        </div>
        <div className="flex-1" />
        <span className="text-[9px] text-muted-foreground">{currentStep + 1}/{questions.length}</span>
        <button onClick={onSkip} className="text-[9px] text-muted-foreground hover:text-foreground underline">Passer</button>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question */}
      <p className="text-[11px] font-semibold text-foreground">{current.question}</p>

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5">
        {current.options.map(opt => {
          const selected = selectedValues.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleValue(opt.value)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all',
                selected
                  ? 'bg-primary/15 border-primary/40 text-primary ring-1 ring-primary/20'
                  : 'bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
              )}
            >
              {selected && <Check className="w-2.5 h-2.5" />}
              {opt.icon && <span>{opt.icon}</span>}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {currentStep > 0 && (
          <button
            onClick={() => setCurrentStep(s => s - 1)}
            className="px-3 py-1.5 rounded-lg text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Retour
          </button>
        )}
        <button
          onClick={next}
          disabled={!canProceed}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all',
            canProceed
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          {isLast ? 'Générer' : 'Suivant'}
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

export default AIClarifyingQuestions;

// ── Keyword detection & question generation ──

const CHANGE_KEYWORDS = [
  'changement', 'change', 'parameter', 'paramètre', 'param',
  'modification', 'update', 'upgrade', 'software', 'mise à jour',
  'jalon', 'milestone', 'événement', 'event', 'date de changement',
];

export const detectNeedsClarification = (prompt: string): boolean => {
  const lower = prompt.toLowerCase();
  return CHANGE_KEYWORDS.some(kw => lower.includes(kw));
};

export const generateClarifyingQuestions = (): ClarifyQuestion[] => [
  {
    id: 'change_scope',
    question: 'Quel périmètre de changements voulez-vous analyser ?',
    options: [
      { value: 'radio', label: 'Radio', icon: '📡' },
      { value: 'core', label: 'Core', icon: '🌐' },
      { value: 'transport', label: 'Transport', icon: '🔗' },
      { value: 'all', label: 'Tous', icon: '🔄' },
    ],
  },
  {
    id: 'topo_level',
    question: 'À quel niveau topologique ?',
    options: [
      { value: 'DR', label: 'DR' },
      { value: 'DOR', label: 'DOR' },
      { value: 'PLAQUE', label: 'Plaque' },
      { value: 'SITE', label: 'Site' },
      { value: 'CELL', label: 'Cellule' },
    ],
    multiSelect: true,
  },
  {
    id: 'time_range',
    question: 'Sur quelle période ?',
    options: [
      { value: '7', label: '7 jours', icon: '📅' },
      { value: '14', label: '14 jours', icon: '📅' },
      { value: '30', label: '30 jours', icon: '📅' },
      { value: 'custom', label: 'Période actuelle', icon: '⚙️' },
    ],
  },
  {
    id: 'change_type',
    question: 'Quels types de changements ?',
    options: [
      { value: 'parameter_tuning', label: 'Param. tuning', icon: '🔧' },
      { value: 'feature_toggle', label: 'Feature ON/OFF', icon: '⚡' },
      { value: 'software_upgrade', label: 'SW Upgrade', icon: '💿' },
      { value: 'all', label: 'Tous', icon: '🔄' },
    ],
    multiSelect: true,
  },
  {
    id: 'display_mode',
    question: 'Comment afficher les changements ?',
    options: [
      { value: 'milestones', label: 'Jalons sur graphe', icon: '📊' },
      { value: 'table', label: 'Tableau détaillé', icon: '📋' },
      { value: 'both', label: 'Les deux', icon: '✨' },
    ],
  },
];
