import React, { useEffect, useRef } from 'react';
import { useLogAnalysis } from './LogAnalysisContext';
import { AnalysisTarget } from './logAnalysisTypes';

interface LogAnalysisDialogProps extends AnalysisTarget {
  open: boolean;
  onClose: () => void;
}

export const LogAnalysisDialog: React.FC<LogAnalysisDialogProps> = ({ open, processId, processName, connectionId }) => {
  const { openAnalysis } = useLogAnalysis();
  const opener = useRef(openAnalysis);
  opener.current = openAnalysis;
  useEffect(() => {
    if (open) opener.current({ processId, processName, connectionId });
  }, [open, processId, processName, connectionId]);
  return null;
};

export default LogAnalysisDialog;
