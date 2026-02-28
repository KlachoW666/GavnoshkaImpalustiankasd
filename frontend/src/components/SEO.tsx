import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title: string;
    description?: string;
    type?: 'website' | 'article';
    image?: string;
    jsonLd?: Record<string, any>;
}

export function SEO({
    title,
    description = 'CLABX — торговые сигналы, авто-трейдинг и копитрейдинг для криптовалют. Подключение OKX, бэктест стратегий, социальная торговля.',
    type = 'website',
    image = 'https://clabx.ru/logo.png',
    jsonLd,
}: SEOProps) {
    const fullTitle = `${title} | CLABX`;

    return (
        <Helmet>
            <title>{fullTitle}</title>
            <meta name="description" content={description} />

            {/* Open Graph / Facebook / Telegram */}
            <meta property="og:type" content={type} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />

            {/* Structured Data (JSON-LD) */}
            {jsonLd && (
                <script type="application/ld+json">
                    {JSON.stringify(jsonLd)}
                </script>
            )}
        </Helmet>
    );
}
