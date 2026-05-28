import Shell from '../components/Shell';
import { panelClass } from '../lib/ui';

const cards = [
  { label: 'EC2 app host', value: 'Small Linux instance with Docker Compose' },
  { label: 'RDS database', value: 'PostgreSQL with private access only' },
  { label: 'Storage', value: 'S3 for patient and sighting photos' },
  { label: 'Serverless task', value: 'API Gateway + Lambda + SQS + SNS' },
];

export default function BillingPage() {
  return (
    <Shell title="Billing & Cost" subtitle="Cloud cost checklist and deployment guidance for the coursework.">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className={panelClass}>
            <div className="text-sm text-slate-500">{card.label}</div>
            <div className="mt-2 font-medium text-slate-900">{card.value}</div>
          </article>
        ))}
      </section>

      <section className={`${panelClass} mt-4`}>
        <h2 className="font-semibold">Cost controls</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
          <li>Use the smallest acceptable EC2 and RDS sizes for demos.</li>
          <li>Keep RDS private and avoid public exposure.</li>
          <li>Stop or delete temporary resources after screenshots are captured.</li>
          <li>Use local Docker Compose for grading instead of cloud when possible.</li>
        </ul>
      </section>
    </Shell>
  );
}
