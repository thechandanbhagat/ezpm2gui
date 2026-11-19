import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import MetricsPage from './MetricsPage';

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock('axios');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('react-chartjs-2', () => ({
  Line: ({ data }) => <output>{data.datasets[0].data.join(',')}</output>,
}));

test('keeps live readings for process 0 scoped to its server and preserves the History tab on switch', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  // React DOM's root.render requires act to flush the chart updates.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  const render = (serverId, cpu) => act(async () => {
    const process = { pm_id: 0, name: 'api', monit: { cpu, memory: 1024 }, pm2_env: { status: 'online' } };
    root.render(<MetricsPage serverId={serverId} processes={[process]} onProcessAction={jest.fn()} />);
  });
  axios.get.mockResolvedValue({ data: { success: true, connections: [] } });

  try {
    await render('local', 5);
    await render('local', 10);
    expect(container.querySelector('output').textContent).toBe('5,10');

    await render('staging', 80);
    expect(container.querySelector('output').textContent).toBe('80');

    const history = [...container.querySelectorAll('button')].find(button => button.textContent === 'metricsPage.history');
    await act(async () => history.click());
    await render('local', 7);
    expect(container.textContent).toContain('Select a connection to view recorded history');
  } finally {
    await act(async () => root.unmount());
  }
});
