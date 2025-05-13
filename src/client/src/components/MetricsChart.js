import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const MetricsChart = ({ processId, initialData }) => {
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [
      {
        label: 'CPU (%)',
        data: [],
        borderColor: 'rgb(74, 144, 226)',
        backgroundColor: 'rgba(74, 144, 226, 0.5)',
      },
      {
        label: 'Memory (MB)',
        data: [],
        borderColor: 'rgb(80, 227, 194)',
        backgroundColor: 'rgba(80, 227, 194, 0.5)',
      },
    ],
  });

  useEffect(() => {
    // Only update if we have valid data
    if (!initialData || !initialData.monit) return;

    const timestamp = new Date().toLocaleTimeString();
    const cpuUsage = initialData.monit.cpu || 0;
    const memoryUsage = initialData.monit.memory ? (initialData.monit.memory / (1024 * 1024)).toFixed(2) : 0;

    setChartData(prevData => {
      // Keep only the last 20 data points
      const labels = [...prevData.labels, timestamp].slice(-20);
      const cpuData = [...prevData.datasets[0].data, cpuUsage].slice(-20);
      const memoryData = [...prevData.datasets[1].data, memoryUsage].slice(-20);

      return {
        labels,
        datasets: [
          {
            ...prevData.datasets[0],
            data: cpuData,
          },
          {
            ...prevData.datasets[1],
            data: memoryData,
          },
        ],
      };
    });
  }, [initialData]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 250,
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return value;
          }
        }
      },
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: `Process ${processId} Metrics`,
      },
    },
  };

  return (
    <div className="metrics-chart">
      <div style={{ height: '300px' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default MetricsChart;
