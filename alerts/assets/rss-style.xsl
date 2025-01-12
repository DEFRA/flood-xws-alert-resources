<?xml version="1.0"?>
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" />
  <xsl:template match="/">
    <xsl:apply-templates select="/rss/channel"/>
  </xsl:template>
  <xsl:template match="/rss/channel">
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="keywords" content="emergency, alert, warning"/>
      <title><xsl:value-of select="title" /></title>
      <style type="text/css">
        body { font-family: monospace; }
        table { margin-left: 20px; }
        img { vertical-align: middle; margin-right: 12px; }
        .block { overflow: hidden; }
        .block img { width: 48px; float: left; }
        .block small { color: darkgray; }
        .block > div { padding-left: 60px; }
        a, a:visited, a:hover, a:active { color: #1d70b8; }
      </style>
      <link rel="icon" type="image/x-icon" href="assets/favicon.ico" />
    </head>
    <body>
      <h2>
        <!-- <img src="{image/url}" alt="logo" width="64px" height="64px"/> -->
        <xsl:value-of select="title" />
      </h2>
      <table>
        <xsl:apply-templates select="item"/>
      </table>
    </body>
    </html>
  </xsl:template>
  <xsl:template match="rss/channel/item">
      <tr>
        <td>
          <div class="block">
            <img src="{enclosure/@url}" class="icon" alt="icon" />
            <div>
              <h4><a href="{link}"><xsl:value-of select="title" /></a></h4>
              <p><xsl:value-of select="description" /></p>
              <p><xsl:value-of select="*[name()='content:encoded']" /></p>
              <small><xsl:value-of select="pubDate" /></small>
            </div>
          </div>
        </td>
      </tr>
  </xsl:template>
</xsl:stylesheet>