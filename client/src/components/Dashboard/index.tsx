import React from 'react';

import { Line } from 'react-chartjs-2';

const MetricsSection = () => {
  const data = {
    labels: ['January', 'February', 'March'],
    datasets: [{
      label: 'User Growth',
      data: [65, 59, 80],
      fill: false,
      borderColor: '#71b4e6'
    }]
  };

  return (
    <div className="metrics">
      <h2>Metrics</h2>
      <Line data={data} />
    </div>
  );
};

const RealTimeLogs = () => {
  // To be implemented with socket.io and filters
  return <div>Loading logs...</div>;
};

import { SwaggerUIComponent } from '../SwaggerUI';

import { useState } from 'react';

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState('metrics');

  return (
    <div className="dashboard">
      <nav>
        <button onClick={() => setActiveSection('metrics')}>Metrics</button>
        <button onClick={() => setActiveSection('api-docs')}>API Docs</button>
      </nav>
      {activeSection === 'metrics' && (
        <div>
          <MetricsSection />
          <RealTimeLogs />
        </div>
      )}
      {activeSection === 'api-docs' && <SwaggerUIComponent />}
    </div>
  );
}
