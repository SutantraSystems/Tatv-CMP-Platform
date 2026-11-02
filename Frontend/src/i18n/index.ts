import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/** English and Hindi to start; regional languages are added as further resource bundles. */
const resources = {
  en: {
    translation: {
      nav: { dashboard: 'Dashboard', catalog: 'All services', network: 'VPC', compute: 'Compute', vms: 'Virtual machines', k8s: 'Kubernetes clusters', storage: 'Storage', databases: 'Databases', iam: 'IAM', monitoring: 'Monitoring and logs', activity: 'Activity and approvals' },
      signIn: { title: 'Sign in to your cloud', subtitle: 'Prototype: choose a demo user. In production this is your organisation\'s single sign-on.', button: 'Sign in' },
      common: { organisation: 'Tenant', project: 'Project', region: 'Region', search: 'Search resources and services', welcome: 'Welcome back', signOut: 'Sign out', language: 'Language', create: 'Create', cancel: 'Cancel' },
    },
  },
  hi: {
    translation: {
      nav: { dashboard: 'डैशबोर्ड', catalog: 'सभी सेवाएँ', network: 'वीपीसी', compute: 'कंप्यूट', vms: 'वर्चुअल मशीनें', k8s: 'कुबेरनेटीस क्लस्टर', storage: 'स्टोरेज', databases: 'डेटाबेस', iam: 'पहचान और पहुँच', monitoring: 'निगरानी और लॉग', activity: 'गतिविधि और अनुमोदन' },
      signIn: { title: 'अपने क्लाउड में साइन इन करें', subtitle: 'प्रोटोटाइप: एक डेमो उपयोगकर्ता चुनें। उत्पादन में यह आपके संगठन का सिंगल साइन-ऑन है।', button: 'साइन इन करें' },
      common: { organisation: 'टेनेंट', project: 'प्रोजेक्ट', region: 'क्षेत्र', search: 'संसाधन और सेवाएँ खोजें', welcome: 'फिर से स्वागत है', signOut: 'साइन आउट', language: 'भाषा', create: 'बनाएँ', cancel: 'रद्द करें' },
    },
  },
};

void i18n.use(initReactI18next).init({ resources, lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false } });

export default i18n;
