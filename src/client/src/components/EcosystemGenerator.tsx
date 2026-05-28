import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

// @group EcosystemGenerator : Generate PM2 ecosystem.config.js from current processes
const EcosystemGenerator: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [includeAllProcesses, setIncludeAllProcesses] = useState(true);
  const [copied, setCopied] = useState(false);

  // @group Handlers : Generate and preview handlers
  const generateEcosystem = async (preview: boolean = false) => {
    try {
      setLoading(true);
      setError('');
      if (preview) {
        const res = await axios.get('/api/deploy/generate-ecosystem-preview');
        setGeneratedContent(res.data.content);
        setPreviewOpen(true);
      } else {
        const res = await axios.post('/api/deploy/generate-ecosystem', {
          path: filePath.trim() || undefined,
          includeAllProcesses,
        });
        setSuccess(`Ecosystem file saved to: ${res.data.path}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate ecosystem file');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // @group Render : CLI-styled ecosystem generator layout
  return (
    <div className="space-y-3">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#555] mb-1">pm2 / tools</p>
          <h1 className="text-sm font-mono font-bold text-[#e8e8e8]">▸ ECOSYSTEM GENERATOR</h1>
          <p className="text-[10px] font-mono text-[#555] mt-0.5">{t('ecosystem.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateEcosystem(true)}
            disabled={loading}
            className="border border-[#333] text-[#888] font-mono text-xs px-3 py-1 rounded-sm hover:border-[#555] hover:text-[#aaa] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('common.preview')}
          </button>
          <button
            onClick={() => generateEcosystem(false)}
            disabled={loading}
            className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '...' : t('ecosystem.generateFile')}
          </button>
        </div>
      </div>

      {/* Toast notifications */}
      {error && (
        <div className="flex items-center gap-2 border border-[#ef4444]/30 bg-[#1a0000] px-3 py-2 rounded-sm">
          <span className="flex-1 text-[10px] font-mono text-[#ef4444]">{error}</span>
          <button onClick={() => setError('')} className="text-[#ef4444] hover:text-[#f87171] text-xs">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 border border-[#22c55e]/30 bg-[#001a00] px-3 py-2 rounded-sm">
          <span className="flex-1 text-[10px] font-mono text-[#22c55e]">{success}</span>
          <button onClick={() => setSuccess('')} className="text-[#22c55e] hover:text-[#4ade80] text-xs">✕</button>
        </div>
      )}

      {/* Output options */}
      <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4">
        <p className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em] mb-3 block">
          {t('ecosystem.outputOptions')}
        </p>

        <form onSubmit={e => { e.preventDefault(); generateEcosystem(false); }} className="space-y-3">
          <div>
            <label className="text-[9px] font-mono text-[#555] uppercase tracking-[0.2em] mb-1.5 block">
              {t('ecosystem.savePath')}
            </label>
            <input
              type="text"
              placeholder="/path/to/ecosystem.config.js"
              value={filePath}
              onChange={e => setFilePath(e.target.value)}
              className="bg-[#0d0d0d] border border-[#1e1e1e] text-[#e8e8e8] font-mono text-xs rounded-sm px-2.5 py-1.5 focus:border-[#555] focus:outline-none w-full"
            />
            <p className="text-[9px] font-mono text-[#555] mt-1">{t('ecosystem.savePathHelper')}</p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAllProcesses}
              onChange={e => setIncludeAllProcesses(e.target.checked)}
              className="accent-[#22c55e] w-3 h-3"
            />
            <span className="text-[10px] font-mono text-[#888]">{t('ecosystem.includeStopped')}</span>
          </label>
        </form>

        <p className="text-[9px] font-mono text-[#555] mt-4 leading-relaxed border-t border-[#1e1e1e] pt-3">
          The generated file can be used to redeploy and manage your processes across environments with{' '}
          <span className="text-[#22d3ee]">pm2 start ecosystem.config.js</span>.
        </p>
      </div>

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="bg-[#111] border border-[#1e1e1e] rounded-sm w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">

            {/* Modal header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
              <span className="text-[10px] font-mono font-bold text-[#e8e8e8]">ecosystem.config.js — Preview</span>
              <button
                onClick={() => setPreviewOpen(false)}
                className="text-[#555] hover:text-[#888] font-mono text-xs"
              >
                ✕
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-auto flex-1 p-3">
              <pre className="bg-[#0a0a0a] border border-[#1e1e1e] font-mono text-[10px] text-[#e8e8e8] p-3 rounded-sm whitespace-pre-wrap break-all">
                {generatedContent}
              </pre>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#1e1e1e]">
              <button
                onClick={handleCopy}
                className="border border-[#333] text-[#888] font-mono text-xs px-3 py-1 rounded-sm hover:border-[#555]"
              >
                {copied ? 'copied' : 'copy'}
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                className="border border-[#1e1e1e] text-[#555] font-mono text-xs px-3 py-1 rounded-sm hover:border-[#333] hover:text-[#888]"
              >
                {t('common.close')}
              </button>
              <button
                onClick={() => { setPreviewOpen(false); generateEcosystem(false); }}
                className="bg-[#e8e8e8] text-[#0a0a0a] font-mono text-xs font-semibold px-4 py-1.5 rounded-sm hover:bg-[#ccc]"
              >
                {t('ecosystem.saveFile')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EcosystemGenerator;
