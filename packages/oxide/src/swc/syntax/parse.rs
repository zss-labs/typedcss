use swc_core::common::comments::SingleThreadedComments;
use swc_core::common::{BytePos, FileName, SourceMap, Span, sync::Lrc};
use swc_core::ecma::ast::{EsVersion, Module};
#[cfg(test)]
use swc_core::ecma::ast::{Expr, ObjectLit};
#[cfg(test)]
use swc_core::ecma::parser::parse_file_as_expr;
use swc_core::ecma::parser::{Syntax, TsSyntax, parse_file_as_module};

fn syntax() -> Syntax {
    Syntax::Typescript(TsSyntax {
        tsx: true,
        ..Default::default()
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Base(pub u32);

impl Base {
    pub fn offset(self, pos: BytePos) -> u32 {
        pos.0.saturating_sub(self.0)
    }

    pub fn start(self, span: Span) -> u32 {
        self.offset(span.lo)
    }

    pub fn end(self, span: Span) -> u32 {
        self.offset(span.hi)
    }

    pub fn range(self, span: Span) -> (u32, u32) {
        (self.start(span), self.end(span))
    }

    pub fn text<'s>(self, source: &'s str, span: Span) -> &'s str {
        let (start, end) = self.range(span);
        source.get(start as usize..end as usize).unwrap_or("")
    }
}

pub struct Parsed {
    pub module: Module,
    pub base: Base,
    pub map: Lrc<SourceMap>,
    pub comments: SingleThreadedComments,
}

pub fn parse_program(source: &str) -> Result<Parsed, String> {
    let map: Lrc<SourceMap> = Default::default();
    let file = map.new_source_file(Lrc::new(FileName::Anon), source.to_string());
    let comments = SingleThreadedComments::default();
    let mut recovered = Vec::new();
    let module = parse_file_as_module(&file, syntax(), EsVersion::latest(), Some(&comments), &mut recovered)
        .map_err(|error| error.kind().msg().to_string())?;
    if let Some(error) = recovered.first() {
        return Err(error.kind().msg().to_string());
    }
    Ok(Parsed {
        module,
        base: Base(file.start_pos.0),
        map,
        comments,
    })
}

#[cfg(test)]
pub fn parse_expression_text(text: &str) -> Option<Box<Expr>> {
    let map: Lrc<SourceMap> = Default::default();
    let file = map.new_source_file(Lrc::new(FileName::Anon), text.to_string());
    let mut recovered = Vec::new();
    let expr =
        parse_file_as_expr(&file, syntax(), EsVersion::latest(), None, &mut recovered).ok()?;
    recovered.is_empty().then_some(expr)
}

#[cfg(test)]
pub fn parse_object_text(text: &str) -> Option<Box<ObjectLit>> {
    match *parse_expression_text(text)? {
        Expr::Object(object) => Some(Box::new(object)),
        Expr::Paren(paren) => match *paren.expr {
            Expr::Object(object) => Some(Box::new(object)),
            _ => None,
        },
        _ => None,
    }
}
