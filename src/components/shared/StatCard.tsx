import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
