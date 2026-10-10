'use client';

import { CircularProgress, Box } from '@mui/material';

export function FullScreenSpinner() {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <CircularProgress size={48} color="primary" />
    </Box>
  );
}