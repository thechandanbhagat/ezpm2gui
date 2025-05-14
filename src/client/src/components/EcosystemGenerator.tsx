import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  Divider,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import axios from 'axios';

const EcosystemGenerator: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [filePath, setFilePath] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [includeAllProcesses, setIncludeAllProcesses] = useState(true);

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilePath(e.target.value);
  };

  const generateEcosystem = async (preview: boolean = false) => {
    try {
      setLoading(true);
      
      if (preview) {
        // Get the ecosystem content as a string
        const response = await axios.get('/api/deploy/generate-ecosystem-preview');
        setGeneratedContent(response.data.content);
        setPreviewOpen(true);
      } else {
        // Generate and save the file
        const response = await axios.post('/api/deploy/generate-ecosystem', {
          path: filePath.trim() || undefined,
          includeAllProcesses
        });
        
        setSuccess(`Ecosystem file generated successfully at: ${response.data.path}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate ecosystem file');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generateEcosystem(false);
  };

  const handlePreview = () => {
    generateEcosystem(true);
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h5" gutterBottom>Ecosystem File Generator</Typography>
        <Divider sx={{ mb: 3 }} />
        
        <Alert severity="info" sx={{ mb: 3 }}>
          Generate an ecosystem.config.js file from your current PM2 processes. 
          This file can be used to easily deploy and manage your processes across different environments.
        </Alert>
        
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="File Path (Optional)"
            placeholder="e.g. /path/to/ecosystem.config.js"
            value={filePath}
            onChange={handlePathChange}
            margin="normal"
            helperText="Leave empty to generate in current directory"
          />
          
          <FormControlLabel
            control={
              <Checkbox
                checked={includeAllProcesses}
                onChange={(e) => setIncludeAllProcesses(e.target.checked)}
              />
            }
            label="Include all processes (even stopped ones)"
            sx={{ mb: 2, display: 'block' }}
          />
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
            <Button
              variant="outlined"
              onClick={handlePreview}
              disabled={loading}
            >
              Preview
            </Button>
            
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Generate Ecosystem File'}
            </Button>
          </Box>
        </Box>
      </Paper>
      
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Ecosystem File Preview</DialogTitle>
        <DialogContent>
          <Box 
            component="pre"
            sx={{ 
              p: 2, 
              borderRadius: 1, 
              bgcolor: '#f5f5f5', 
              overflowX: 'auto',
              fontSize: '0.875rem'
            }}
          >
            {generatedContent}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Close</Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={() => {
              setPreviewOpen(false);
              generateEcosystem(false);
            }}
          >
            Generate File
          </Button>
        </DialogActions>
      </Dialog>
      
      <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError('')}>
        <Alert severity="error">{error}</Alert>
      </Snackbar>
      
      <Snackbar open={!!success} autoHideDuration={6000} onClose={() => setSuccess('')}>
        <Alert severity="success">{success}</Alert>
      </Snackbar>
    </Box>
  );
};

export default EcosystemGenerator;
