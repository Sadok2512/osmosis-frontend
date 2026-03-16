import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { agentApi } from '@/api/agentApi';
import { useAuth } from '@/context/AuthContext';

export default function AssistantPage() {
  const { userId } = useAuth();
  const [sessionId, setSessionId] = useState('');
  const [message, setMessage] = useState('Why did site PARIS_01 degrade yesterday?');

  const sessionsQuery = useQuery({ queryKey: ['chat-sessions', userId], queryFn: () => agentApi.getSessions({ user_id: userId, limit: 20 }) });
  const sessionMutation = useMutation({ mutationFn: () => agentApi.createSession({ user_id: userId, language: 'fr' }), onSuccess: (data) => setSessionId(data.session_id) });
  const sendMutation = useMutation({ mutationFn: () => agentApi.sendMessage({ session_id: sessionId, message, user_id: userId }) });

  useEffect(() => {
    if (!sessionId && sessionsQuery.data?.[0]?.session_id) setSessionId(sessionsQuery.data[0].session_id);
  }, [sessionsQuery.data, sessionId]);

  return (
    <div>
      <PageHeader title="Agent investigation" description="Conversation endpoint for RCA, timeline, and recommendations." actions={<Button onClick={() => sessionMutation.mutate()}>New session</Button>} />
      <div className="grid gap-6 p-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Ask the agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-400">Session: {sessionId || 'none yet'}</div>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-32 border-slate-700 bg-slate-950" />
            <Button onClick={() => sendMutation.mutate()} disabled={!sessionId}>Send</Button>
            <pre className="overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(sendMutation.data, null, 2) || 'No response yet.'}</pre>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900/70 text-slate-100">
          <CardHeader>
            <CardTitle>Previous sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead>Session</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Messages</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessionsQuery.data || []).map((item) => (
                  <TableRow key={item.session_id} className="cursor-pointer border-slate-800" onClick={() => setSessionId(item.session_id)}>
                    <TableCell className="font-mono text-xs">{item.session_id}</TableCell>
                    <TableCell>{item.title || 'Session'}</TableCell>
                    <TableCell>{item.total_messages ?? 0}</TableCell>
                    <TableCell>{item.created_at}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
