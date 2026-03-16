import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-semibold">Page not found</h1>
        <p className="text-slate-400">The route does not exist in the QOEBIT frontend scaffold.</p>
        <Button asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
