import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function CourtesyMassSendingPage() {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: (formData: FormData) => {
      return apiRequest('POST', '/api/courtesy/mass-send', formData);
    },
    onSuccess: async () => {
      toast({
        title: 'Emails enfileirados para envio',
        description: 'Os e-mails de cortesia estão sendo processados e serão enviados em breve.',
      });
      setCsvFile(null);
      setAttachmentFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar e-mails',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCsvChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setCsvFile(event.target.files[0]);
    }
  };

  const handleAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setAttachmentFile(event.target.files[0]);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!csvFile) {
      toast({
        title: 'Nenhum arquivo selecionado',
        description: 'Por favor, selecione um arquivo CSV.',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('csvFile', csvFile);
    
    // Only append attachment if one is selected
    if (attachmentFile) {
      formData.append('attachment', attachmentFile);
    }

    mutation.mutate(formData);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Envio em Massa de Cortesias</h1>
      <Card>
        <CardHeader>
          <CardTitle>Enviar Cortesias por CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="csvFile">Arquivo CSV *</Label>
              <Input
                id="csvFile"
                type="file"
                accept=".csv"
                onChange={handleCsvChange}
                required
              />
              <p className="text-sm text-gray-500">
                O arquivo deve conter as colunas: name, email, amount_of_courtesies, event_id
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attachment">Anexo (Opcional)</Label>
              <Input
                id="attachment"
                type="file"
                onChange={handleAttachmentChange}
              />
              <p className="text-sm text-gray-500">
                Selecione um arquivo para anexar a todos os e-mails de cortesia (PDF, DOC, etc.)
              </p>
              {attachmentFile && (
                <p className="text-sm text-green-600">
                  Arquivo selecionado: {attachmentFile.name}
                </p>
              )}
            </div>

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Enviando...' : 'Enviar E-mails'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}