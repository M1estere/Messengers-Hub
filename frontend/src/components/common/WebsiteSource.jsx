export default function WebsiteSource({ pageUrl }) {
    let websiteUrl = null
    try {
        const parsed = new URL(pageUrl)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') websiteUrl = parsed
    } catch {
        websiteUrl = null
    }

    return (
        <span className="chat-source">
      Источник: сайт
            {websiteUrl && (
                <>
                    {' - '}
                    <a href={websiteUrl.href} target="_blank" rel="noopener noreferrer" title={websiteUrl.href}>
                        {websiteUrl.hostname}
                    </a>
                </>
            )}
    </span>
    )
}