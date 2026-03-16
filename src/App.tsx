import { useState } from 'react';
import ChartDialog from './ChartDialog';

function App() {
  const [dialogOpen, setDialogOpen] = useState(true);

  return (
    <>
      <ChartDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

export default App
