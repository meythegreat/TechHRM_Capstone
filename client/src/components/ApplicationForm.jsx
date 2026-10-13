import WspApplicationWizard from './wsp/WspApplicationWizard';
import { submitApplication } from '../services/applicationService';

const ApplicationForm = ({ onApplicationSubmitted }) => (
    <WspApplicationWizard
        onFinished={onApplicationSubmitted}
        onSubmit={async (payload) => {
            const response = await submitApplication(payload);
            return response.data;
        }}
    />
);

export default ApplicationForm;
