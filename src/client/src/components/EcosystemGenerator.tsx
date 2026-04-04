import React, { useState } from 'react';
import {
  Box, Paper, Typography, Button, TextField, Alert, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, FormControlLabel, Checkbox
} from '@mui/material';
import { Preview as PreviewIcon, Save as SaveIcon } from '@mui/icons-material';
import axios from 'axios';
import PageHeader from './PageHeader';

// @group EcosystemGenerator : Generate PM2 ecosystem.config.js from current processes
const EcosystemGenerator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [includeAllProcesses, setIncludeAllProcesses] = useState(true);

  // @group Handlers : Generate and preview handlers
  const generateEcosystem = async (preview: boolean = false) => {
    try {
      setLoading(true);
      if (preview) {
        const res = await axios.get('/api/deploy/generate-ecosystem-preview');
        setGeneratedContent(res.data.content);
        setPreviewOpen(true);
      } else {
        const res = await axios.post('/api/deploy/generate-ecosystem', {
          path: filePath.trim() || undefined,
          includeAllProcesses
        });
        setSuccess(`Ecosystem file saved to: ${res.data.path}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate ecosystem file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Ecosystem Generator"
        subtitle="Generate an ecosystem.config.js from your current PM2 processes"
        actions={
          <>
            <Button variant="outlined" startIcon={<PreviewIcon />}
              onClick={() => generateEcosystem(true)} disabled={loading}>
              Preview
            </Button>
            <Button variant="contained" startIcon={<SaveIcon />}
              onClick={() => generateEcosystem(false)} disabled={loading}>
              {loading ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
              Generate File
            </Button>
          </>
        }
      />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>Output Options</Typography>

        <Box component="form" onSubmit={e => { e.preventDefault(); generateEcosystem(false); }}>
          <TextField
            fullWidth label="Save Path (optional)"
            placeholder="/path/to/ecosystem.config.js"
            value={filePath} onChange={e => setFilePath(e.target.value)}
            helperText="Leave empty to save in the current working directory"
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Checkbox checked={includeAllProcesses}
                onChange={e => setIncludeAllProcesses(e.target.checked)} />
            }
            label={<Typography variant="body2">Include stopped processes</Typography>}
          />
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
          The generated file can be used to redeploy and manage your processes across environments with <code>pm2 start ecosystem.config.js</code>.
        </Typography>
      </Paper>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>ecosystem.config.js — Preview</DialogTitle>
        <DialogContent dividers>
          <Box component="pre" sx={{
            p: 2, borderRadius: 1, m: 0,
            bgcolor: 'action.hover',
            overflowX: 'auto',
            fontSize: '0.8125rem',
            fontFamily: 'monospace',
            lineHeight: 1.6
          }}>
            {generatedContent}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => { setPreviewOpen(false); generateEcosystem(false); }}>
            Save File
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!error} autoHideDuration={5000} onClose={() => setError('')}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={5000} onClose={() => setSuccess('')}>
        <Alert severity="success">{success}</Alert>
      </Snackbar>
    </Box>
  );
};

export default EcosystemGenerator;
